const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const config = require("../config");

const s3 = new S3Client({
  region: config.minio.region,
  endpoint: config.minio.endpoint,
  credentials: {
    accessKeyId: config.minio.accessKeyId,
    secretAccessKey: config.minio.secretAccessKey,
  },
  forcePathStyle: true,
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.minio.bucket }));
    console.log(`[MinIO] Bucket "${config.minio.bucket}" exists`);
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      console.log(
        `[MinIO] Bucket "${config.minio.bucket}" not found — creating...`
      );
      await s3.send(new CreateBucketCommand({ Bucket: config.minio.bucket }));
      console.log(
        `[MinIO] Bucket "${config.minio.bucket}" created successfully`
      );
    } else {
      console.error("[MinIO] Bucket check failed:", err);
      throw err;
    }
  }
}

async function uploadBuffer(key, buffer, contentType = "application/pdf") {
  const cmd = new PutObjectCommand({
    Bucket: config.minio.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3.send(cmd);
  return key;
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function getObjectBuffer(key) {
  const cmd = new GetObjectCommand({
    Bucket: process.env.MINIO_BUCKET || "uploads",
    Key: key,
  });
  const response = await s3.send(cmd);
  return await streamToBuffer(response.Body);
}

async function getPresignedUrl(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({
    Bucket: config.minio.bucket,
    Key: key,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return url;
}

module.exports = {
  s3,
  ensureBucket,
  uploadBuffer,
  getObjectBuffer,
  getPresignedUrl,
};
