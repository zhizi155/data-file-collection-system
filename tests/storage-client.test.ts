import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createStorageS3Client } from "../src/lib/storage-client";

test("raw multipart storage clients inject the Coze workload identity token", async () => {
  let observedToken: string | undefined;
  let observedUrl: string | undefined;
  const server = createServer((request, response) => {
    observedToken = request.headers["x-storage-token"] as string | undefined;
    observedUrl = request.url;
    response.statusCode = 200;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未启动");

  const previousEndpoint = process.env.COZE_BUCKET_ENDPOINT_URL;
  const previousToken = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  process.env.COZE_BUCKET_ENDPOINT_URL = `http://127.0.0.1:${address.port}`;
  process.env.COZE_WORKLOAD_IDENTITY_API_KEY = "test-storage-token";
  const client = createStorageS3Client();

  try {
    await client.send(new HeadObjectCommand({ Bucket: "test-bucket", Key: "path/file.xlsx" }));
    assert.equal(observedToken, "test-storage-token");
    assert.equal(observedUrl, "/test-bucket/path/file.xlsx");
  } finally {
    client.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousEndpoint === undefined) delete process.env.COZE_BUCKET_ENDPOINT_URL;
    else process.env.COZE_BUCKET_ENDPOINT_URL = previousEndpoint;
    if (previousToken === undefined) delete process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
    else process.env.COZE_WORKLOAD_IDENTITY_API_KEY = previousToken;
  }
});
