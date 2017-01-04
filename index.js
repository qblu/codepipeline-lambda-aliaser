'use strict';

const Promise = require('bluebird');
const codePipelineCustomAction = require('codepipeline-custom-action');
const verboseLog = codePipelineCustomAction.verboseLog;
const verboseError = codePipelineCustomAction.verboseError;
const createJobValidator = codePipelineCustomAction.createJobValidator;
const createAction = codePipelineCustomAction.createAction;

const AWS = require('aws-sdk');
AWS.config.setPromisesDependency(Promise);

const lambda = new AWS.Lambda();

const jobValidator = createJobValidator(1, 0, job => {
	if (!job.data || !job.data.actionConfiguration || !job.data.actionConfiguration.configuration || !job.data.actionConfiguration.configuration.UserParameters) {
		throw new Error('Alias name must be specified via CodePipeline custom action user parameters');
	}

	job.aliasName = job.data.actionConfiguration.configuration.UserParameters;

	return job;
});

const inputHandler = (job, input) => {
	verboseLog('Received input:\n' + JSON.stringify(input, null, 2));

	let updates = input.map(version => {
		const params = {
			FunctionName: version.FunctionName,
			Name: job.aliasName,
			FunctionVersion: version.Version,
		};

		verboseLog('Updating alias:\n' + JSON.stringify(params, null, 2));

		return lambda.updateAlias(params)
			.promise()
			.then(data => {
				verboseLog(`Updated alias ${data.AliasArn}`);
			})
			.catch(error => {
				if (error.code !== 'ResourceNotFoundException') {
					verboseError(`Failed to update ${params.Name} alias for ${params.FunctionName}: ${error}`);
					throw error;
				}

				verboseLog(`The ${params.Name} alias for ${params.FunctionName} does not exist; creating`);

				return lambda.createAlias(params)
					.promise()
					.then(data => {
						verboseLog(`Created alias ${data.AliasArn}`);
					})
					.catch(error => {
						verboseError(`Failed to create ${params.Name} alias for ${params.FunctionName}: ${error}`);
						throw error;
					});
			});
	});

	return Promise.all(updates)
		.then(() => [job]);
};

exports.handler = createAction({
	jobValidator,
	inputHandler,
});
