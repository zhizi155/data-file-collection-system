import assert from "node:assert/strict";
import test from "node:test";

import { selectSingleFile } from "../src/lib/single-file-selection";

test("accepts one file when the upload slot is empty", () => {
  const file = { name: "orders.xlsx" };
  assert.deepEqual(selectSingleFile([file], 0), { file, error: null });
});

test("rejects a multi-file selection without accepting a partial batch", () => {
  const result = selectSingleFile([{ name: "a.xlsx" }, { name: "b.xlsx" }], 0);
  assert.equal(result.file, null);
  assert.match(result.error ?? "", /只能上传 1 个文件/);
});

test("rejects another file while the current file remains", () => {
  const result = selectSingleFile([{ name: "next.xlsx" }], 1);
  assert.equal(result.file, null);
  assert.match(result.error ?? "", /完成或移除当前文件/);
});
