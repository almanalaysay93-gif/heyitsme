import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

export function getS3Client(): S3Client {
  const config: {
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  } = {
    region: ENV.s3Region || "us-east-1",
  };

  if (ENV.awsAccessKeyId && ENV.awsSecretAccessKey) {
    config.credentials = {
      accessKeyId: ENV.awsAccessKeyId,
      secretAccessKey: ENV.awsSecretAccessKey,
    };
  }

  return new S3Client(config);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function getPresignedPutUrl(
  relKey: string,
  contentType = "application/octet-stream",
  expiresIn = 3600
): Promise<{ key: string; uploadUrl: string; downloadUrl: string }> {
  if (!ENV.s3Bucket) {
    throw new Error("S3_BUCKET is not configured");
  }
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));
  const command = new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return {
    key,
    uploadUrl,
    downloadUrl: `/storage/${key}`,
  };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!ENV.s3Bucket) {
    throw new Error("S3_BUCKET is not configured");
  }
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));
  const buffer =
    typeof data === "string"
      ? Buffer.from(data)
      : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);

  const command = new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);
  return { key, url: `/storage/${key}` };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

export async function storageGetSignedUrl(
  relKey: string,
  expiresIn = 3600
): Promise<string> {
  if (!ENV.s3Bucket) {
    throw new Error("S3_BUCKET is not configured");
  }
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}
