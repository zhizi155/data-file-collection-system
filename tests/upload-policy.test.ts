import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, validateUploadCandidate } from "../src/lib/upload-policy";

test("invalid persisted policy values fall back to safe defaults", () => {
  const policy = mergeUploadPolicy([
    { key: "max_file_size", value: -1 },
    { key: "max_batch_size", value: "25" },
  ]);
  assert.equal(policy.maxFileSize, DEFAULT_UPLOAD_POLICY.maxFileSize);
  assert.equal(policy.maxBatchSize, 25);
});

test("server policy rejects empty, oversized and unsupported files", () => {
  const errors = validateUploadCandidate(
    { fileName: " ", fileSize: DEFAULT_UPLOAD_POLICY.maxFileSize + 1, contentType: "application/x-msdownload" },
    DEFAULT_UPLOAD_POLICY,
  );
  assert.equal(errors.length, 3);
});

test("allowed spreadsheet passes validation", () => {
  assert.deepEqual(validateUploadCandidate(
    { fileName: "report.xlsx", fileSize: 1024, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    DEFAULT_UPLOAD_POLICY,
  ), []);
});
