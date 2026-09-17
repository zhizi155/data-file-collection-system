import {
  GetObjectCommand,
  HeadObjectCommand,
  type GetObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";

export type ObjectSizeSource = "head" | "range" | "stream";

export interface StoredObjectSize {
  size: number;
  source: ObjectSizeSource;
}

function normalizeSize(value: unknown): number | null {
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function parseContentRange(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\/(\d+)$/);
  return match ? normalizeSize(match[1]) : null;
}

async function countBodyBytes(body: GetObjectCommandOutput["Body"]): Promise<number> {
  if (!body) throw new Error("对象存储读取响应缺少文件内容");

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === "function") {
    return (await transformable.transformToByteArray()).byteLength;
  }

  if (typeof body === "object" && Symbol.asyncIterator in body) {
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      total += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
    }
    return total;
  }

  throw new Error("对象存储返回了不支持的文件流");
}

/**
 * Coze's S3-compatible gateway can return an empty or missing Content-Length
 * for HEAD requests. Use HEAD as the fast path, then verify through a one-byte
 * range request and finally a streaming byte count when the gateway omits the
 * total from Content-Range.
 */
export async function getStoredObjectSize(
  client: S3Client,
  bucket: string,
  key: string,
  expectedSize: number,
): Promise<StoredObjectSize> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const headSize = normalizeSize(head.ContentLength);
    if (headSize === expectedSize) return { size: headSize, source: "head" };
  } catch (error) {
    console.warn("对象存储 HEAD 大小校验不可用，改用读取校验:", error);
  }

  try {
    const range = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: "bytes=0-0",
    }));
    const totalSize = parseContentRange(range.ContentRange);
    if (totalSize !== null) {
      await countBodyBytes(range.Body);
      return { size: totalSize, source: "range" };
    }

    const rangeBytes = await countBodyBytes(range.Body);
    if (rangeBytes === expectedSize) return { size: rangeBytes, source: "range" };
  } catch (error) {
    console.warn("对象存储范围读取大小校验不可用，改用流式校验:", error);
  }

  const fullObject = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return { size: await countBodyBytes(fullObject.Body), source: "stream" };
}
