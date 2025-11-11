const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const config = require("../config");

const connection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
});

const evaluationQueue = new Queue("evaluation", { connection });

module.exports = { evaluationQueue, connection };
