import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";
import { getSupabaseAdminClient } from "./_core/supabase";

/** S3 when a bucket is set, otherwise Supabase Storage when its URL and secret key are set. */
export function storageBackend(): "s3" | "supabase" | null {
  if (ENV.s3Bucket) return "s3";
  if (ENV.supabaseUrl && ENV.supabaseServiceRoleKey) return "supabase";
  return null;
}

/** The stored file does not exist, so the storage proxy can answer 404. */
export class StorageNotFoundError extends Error {}

let supabaseClient: ReturnType<typeof getSupabaseAdminClient> | null = null;
let supabaseBucketReady: Promise<void> | null = null;

function supabaseBucket() {
  supabaseClient ??= getSupabaseAdminClient();
  return supabaseClient.storage.from(ENV.supabaseStorageBucket);
}

// Private bucket: visitors only reach files through the short-lived signed links /storage/ hands out.
function ensureSupabaseBucket() {
  supabaseBucketReady ??= (async () => {
    supabaseClient ??= getSupabaseAdminClient();
    const existing = await supabaseClient.storage.getBucket(ENV.supabaseStorageBucket);
    if (!existing.error) return;
    const created = await supabaseClient.storage.createBucket(ENV.supabaseStorageBucket, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  })().catch((error) => {
    supabaseBucketReady = null;
    throw error;
  });
  return supabaseBucketReady;
}

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
  const backend = storageBackend();
  if (!backend) {
    throw new Error("File storage is not configured. Set S3_BUCKET, or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const key = appendHashSuffix(normalizeKey(relKey));
  const buffer =
    typeof data === "string"
      ? Buffer.from(data)
      : Buffer.isBuffer(data)
      ? data
      : Buffer.from(data);

  if (backend === "supabase") {
    await ensureSupabaseBucket();
    const { error } = await supabaseBucket().upload(key, buffer, { contentType, upsert: false });
    if (error) throw error;
    return { key, url: `/storage/${key}` };
  }

  const command = new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await getS3Client().send(command);
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
  const backend = storageBackend();
  if (!backend) {
    throw new Error("File storage is not configured");
  }
  const key = normalizeKey(relKey);
  if (backend === "supabase") {
    const { data, error } = await supabaseBucket().createSignedUrl(key, expiresIn);
    if (error) {
      // Covers a missing file and a bucket nothing has been uploaded to yet.
      if (/not found/i.test(error.message)) throw new StorageNotFoundError(key);
      throw error;
    }
    return data.signedUrl;
  }
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}
