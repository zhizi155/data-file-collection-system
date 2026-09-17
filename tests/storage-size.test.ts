import assert from "node:assert/strict";
import test from "node:test";
import { GetObjectCommand, HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getStoredObjectSize } from "../src/lib/storage-size";

function body(...chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) yield Buffer.from(chunk);
  })();
}

test("uses HEAD when the gateway reports the expected size", async () => {
  let calls = 0;
  const client = {
    async send(command: unknown) {
      calls += 1;
      assert.ok(command instanceof HeadObjectCommand);
      return { ContentLength: 34 };
    },
  } as unknown as S3Client;

  assert.deepEqual(await getStoredObjectSize(client, "bucket", "file.csv", 34), {
    size: 34,
    source: "head",
  });
  assert.equal(calls, 1);
});

test("falls back to Content-Range when HEAD returns a misleading zero", async () => {
  let calls = 0;
  const client = {
    async send(command: unknown) {
      calls += 1;
      if (command instanceof HeadObjectCommand) return { ContentLength: 0 };
      assert.ok(command instanceof GetObjectCommand);
      return { ContentRange: "bytes 0-0/34", Body: body("x") };
    },
  } as unknown as S3Client;

  assert.deepEqual(await getStoredObjectSize(client, "bucket", "file.csv", 34), {
    size: 34,
    source: "range",
  });
  assert.equal(calls, 2);
});

test("streams the object when the gateway omits Content-Range", async () => {
  let calls = 0;
  const client = {
    async send(command: unknown) {
      calls += 1;
      if (command instanceof HeadObjectCommand) return {};
      assert.ok(command instanceof GetObjectCommand);
      if (calls === 2) return { ContentLength: 1, Body: body("x") };
      return { Body: body("123", "4567") };
    },
  } as unknown as S3Client;

  assert.deepEqual(await getStoredObjectSize(client, "bucket", "file.csv", 7), {
    size: 7,
    source: "stream",
  });
  assert.equal(calls, 3);
});
