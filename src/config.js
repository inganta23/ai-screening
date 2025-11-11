const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  openaiKey: process.env.OPENAI_API_KEY,
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "http://minio:9000",
    bucket: process.env.MINIO_BUCKET || "uploads",
    accessKeyId: process.env.MINIO_ROOT_USER,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
    region: process.env.MINIO_REGION || "us-east-1",
  },
  redis: {
    host: process.env.REDIS_HOST || "redis",
    port: process.env.REDIS_PORT || 6379,
  },
  chromaHost: process.env.CHROMA_HOST || "http://chroma:8000",
};
