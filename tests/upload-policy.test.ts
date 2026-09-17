import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_UPLOAD_POLICY,
  mergeUploadPolicy,
  resolveUploadContentType,
  validateUploadCandidate,
} from "../src/lib/upload-policy";

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

test("generic browser MIME types are resolved for zip and rar archives", () => {
  assert.equal(resolveUploadContentType("backup.ZIP", "application/octet-stream"), "application/zip");
  assert.equal(resolveUploadContentType("backup.rar", ""), "application/x-rar-compressed");
  assert.deepEqual(validateUploadCandidate(
    { fileName: "backup.zip", fileSize: 1024, contentType: "application/octet-stream" },
    DEFAULT_UPLOAD_POLICY,
  ), []);
  assert.deepEqual(validateUploadCandidate(
    { fileName: "backup.rar", fileSize: 1024, contentType: "application/octet-stream" },
    DEFAULT_UPLOAD_POLICY,
  ), []);
});

test("common archive MIME aliases are normalized without allowing unknown binaries", () => {
  assert.deepEqual(validateUploadCandidate(
    { fileName: "backup.zip", fileSize: 1024, contentType: "application/x-zip-compressed" },
    DEFAULT_UPLOAD_POLICY,
  ), []);
  assert.deepEqual(validateUploadCandidate(
    { fileName: "backup.rar", fileSize: 1024, contentType: "application/vnd.rar" },
    DEFAULT_UPLOAD_POLICY,
  ), []);
  assert.deepEqual(validateUploadCandidate(
    { fileName: "program.exe", fileSize: 1024, contentType: "application/octet-stream" },
    DEFAULT_UPLOAD_POLICY,
  ), ["不支持的文件类型：application/octet-stream"]);
});
