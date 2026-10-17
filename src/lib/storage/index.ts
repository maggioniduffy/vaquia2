import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey, contentTypeForName } from "./keys";

export type StoredFile = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
};

export interface Storage {
  /** False when no driver is configured (e.g. Vercel without R2): file attachments are disabled. */
  readonly isAvailable: boolean;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Null when the object does not exist. */
  get(key: string): Promise<StoredFile | null>;
}

const unavailable: Storage = {
  isAvailable: false,
  async put() {
    throw new Error("Storage is not available");
  },
  async get() {
    return null;
  },
};

function r2Storage(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): Storage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    isAvailable: true,
    async put(key, bytes, contentType) {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      assertSafeKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!res.Body) return null;
        return {
          body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          contentType: res.ContentType ?? contentTypeForName(key),
          size: res.ContentLength ?? null,
        };
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw error;
      }
    },
  };
}

function localStorage(root: string): Storage {
  const resolve = (key: string) => {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  };
  return {
    isAvailable: true,
    async put(key, bytes) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
    async get(key) {
      const full = resolve(key);
      try {
        const info = await stat(full);
        if (!info.isFile()) return null;
        return {
          body: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
          contentType: contentTypeForName(key),
          size: info.size,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

function createStorage(): Storage {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (accountId && accessKeyId && secretAccessKey && bucket) {
    return r2Storage({ accountId, accessKeyId, secretAccessKey, bucket });
  }
  // Local disk only off Vercel (its filesystem is read-only/ephemeral).
  if (!process.env.VERCEL) {
    return localStorage(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
  }
  return unavailable;
}

const globalForStorage = globalThis as unknown as { vaquiaStorage?: Storage };

/** Resolved lazily on first use so `next build` works without any configuration. */
export function getStorage(): Storage {
  globalForStorage.vaquiaStorage ??= createStorage();
  return globalForStorage.vaquiaStorage;
}
