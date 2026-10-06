import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_NOTE_PREFIX,
  createCollectionNoteKey,
  createCollectionNoteMetadata,
  parseCollectionNote,
} from "../src/lib/collection-notes";

test("collection note keys are deterministic, bounded and type-specific", () => {
  const key = createCollectionNoteKey("shop-a", "订单");
  assert.ok(key.startsWith(COLLECTION_NOTE_PREFIX));
  assert.ok(key.length <= 100);
  assert.equal(key, createCollectionNoteKey("shop-a", "订单"));
  assert.notEqual(key, createCollectionNoteKey("shop-a", "广告费"));
  assert.notEqual(key, createCollectionNoteKey("shop-b", "订单"));
});

test("collection note metadata round-trips and malformed system rows are ignored", () => {
  const parsed = parseCollectionNote({
    name: createCollectionNoteKey("shop-a", "订单"),
    value: "  本期平台未生成文件  ",
    description: createCollectionNoteMetadata("shop-a", "订单"),
    updated_at: "2026-10-06T08:00:00.000Z",
  });

  assert.deepEqual(parsed, {
    shopId: "shop-a",
    exportType: "订单",
    note: "本期平台未生成文件",
    updatedAt: "2026-10-06T08:00:00.000Z",
  });
  assert.equal(parseCollectionNote({
    name: `${COLLECTION_NOTE_PREFIX}broken`,
    value: "备注",
    description: "not-json",
    updated_at: null,
  }), null);
});
