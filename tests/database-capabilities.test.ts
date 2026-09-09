import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingDatabaseFeatureError,
  normalizeUploadedFileForSchema,
} from "../src/lib/database-capabilities";

test("recognizes missing legacy columns and tables", () => {
  assert.equal(isMissingDatabaseFeatureError({ code: "42703", message: "column does not exist" }), true);
  assert.equal(isMissingDatabaseFeatureError({ code: "PGRST205", message: "schema cache" }), true);
  assert.equal(isMissingDatabaseFeatureError({ code: "42501", message: "permission denied" }), false);
});

test("fills versioning fields for legacy uploaded file rows", () => {
  const row = normalizeUploadedFileForSchema({ id: "file-1", original_name: "订单.xlsx" }, "legacy");
  assert.equal(row.version, 1);
  assert.equal(row.is_current, true);
  assert.equal(row.is_deleted, false);
  assert.equal(row.period_label, null);
});

test("preserves versioning values for upgraded rows", () => {
  const row = normalizeUploadedFileForSchema({
    id: "file-2",
    version: 3,
    is_current: false,
    is_deleted: true,
    period_label: "2026-08",
  }, "versioned");
  assert.equal(row.version, 3);
  assert.equal(row.is_current, false);
  assert.equal(row.is_deleted, true);
  assert.equal(row.period_label, "2026-08");
});
