import assert from "node:assert/strict";
import test from "node:test";
import { isMissingColumnError } from "../src/lib/database-errors";

test("recognizes PostgREST schema-cache missing-column errors", () => {
  assert.equal(isMissingColumnError({
    code: "PGRST204",
    message: "Could not find the 'idempotency_key' column of 'uploaded_files' in the schema cache",
  }, "idempotency_key"), true);
});

test("recognizes PostgreSQL undefined-column errors", () => {
  assert.equal(isMissingColumnError({
    code: "42703",
    message: "column uploaded_files.idempotency_key does not exist",
  }, "idempotency_key"), true);
});

test("does not hide unrelated database failures", () => {
  assert.equal(isMissingColumnError({ code: "42501", message: "permission denied" }, "idempotency_key"), false);
});
