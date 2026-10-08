import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "./config.js";
import { assertSafeObjectKey } from "./validation.js";

let cachedClient: S3Client | null = null;

export function s3Client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: requireEnv("HETZNER_S3_REGION"),
      endpoint: requireEnv("HETZNER_S3_ENDPOINT"),
      credentials: {
        accessKeyId: requireEnv("HETZNER_S3_ACCESS_KEY"),
        secretAccessKey: requireEnv("HETZNER_S3_SECRET_KEY"),
      },
    });
  }
  return cachedClient;
}

export function bucket(): string {
  return requireEnv("HETZNER_S3_BUCKET");
}

export async function signSingleUpload(key: string, contentType: string, sessionId: string) {
  assertSafeObjectKey(key);
  const headers = { "content-type": contentType, "x-amz-meta-upload-session": sessionId, "if-none-match": "*" };
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    IfNoneMatch: "*",
    Metadata: { "upload-session": sessionId },
  });
  const url = await getSignedUrl(s3Client(), command, {
    expiresIn: 10 * 60,
    signableHeaders: new Set(["content-type", "if-none-match"]),
  });
  return { url, headers, expiresIn: 600 };
}

export async function startMultipart(key: string, contentType: string, sessionId: string): Promise<string> {
  assertSafeObjectKey(key);
  const result = await s3Client().send(new CreateMultipartUploadCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    Metadata: { "upload-session": sessionId },
  }));
  if (!result.UploadId) throw new Error("Multipart-Upload konnte nicht gestartet werden.");
  return result.UploadId;
}

export async function signPart(key: string, uploadId: string, partNumber: number) {
  assertSafeObjectKey(key);
  const command = new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber });
  return getSignedUrl(s3Client(), command, { expiresIn: 10 * 60 });
}

export async function completeMultipart(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  assertSafeObjectKey(key);
  await s3Client().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  assertSafeObjectKey(key);
  await s3Client().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

export async function headObject(key: string) {
  assertSafeObjectKey(key);
  return s3Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteObjects(keys: Array<string | null | undefined>): Promise<void> {
  const safeKeys = keys.filter((key): key is string => Boolean(key));
  safeKeys.forEach(assertSafeObjectKey);
  if (!safeKeys.length) return;
  const result = await s3Client().send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: safeKeys.map((Key) => ({ Key })), Quiet: true },
  }));
  if (result.Errors?.length) throw new Error(`Object Storage konnte ${result.Errors.length} Objekt(e) nicht löschen.`);
}

export async function signDownload(key: string, disposition: "inline" | "attachment", filename?: string) {
  assertSafeObjectKey(key);
  const safeName = (filename ?? "datei").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: `${disposition}; filename="${safeName}"`,
  });
  return getSignedUrl(s3Client(), command, { expiresIn: 5 * 60 });
}
