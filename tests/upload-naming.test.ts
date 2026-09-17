import assert from "node:assert/strict";
import test from "node:test";
import { getUploadDisplayName } from "../src/lib/upload-naming";

test("selected export type owns the visible file name while preserving the extension", () => {
  assert.equal(getUploadDisplayName("orders.xlsx", "ignored-name.xlsx", "订单"), "订单.xlsx");
});

test("files without an extension do not gain the whole original name as an extension", () => {
  assert.equal(getUploadDisplayName("README", "renamed", "说明"), "说明");
});

test("generated names remain visible when the shop has no export type", () => {
  assert.equal(getUploadDisplayName("source.csv", "shop_2026-09-17.csv"), "shop_2026-09-17.csv");
});
