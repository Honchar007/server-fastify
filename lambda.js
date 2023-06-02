const awsLambdaFastify = require('aws-lambda-fastify')
const fastify = require('./index.js');

const proxy = awsLambdaFastify(fastify)
exports.handler = async (event, context) => proxy(event, context);
