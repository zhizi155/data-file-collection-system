import assert from "node:assert/strict";
import test from "node:test";

import { buildCollectionProgress } from "../src/lib/collection-progress";

test("special note distinguishes no-file rows from genuinely missing uploads", () => {
  const progress = buildCollectionProgress([
    {
      id: "shop-a",
      name: "A店",
      site: "PH",
      platform: "Shopee",
      manager: "负责人",
      export_type: "订单,广告费,收入",
    },
  ], [
    { shop_id: "shop-a", export_type: "订单", created_at: "2026-10-06T01:00:00.000Z" },
  ], [
    {
      shopId: "shop-a",
      exportType: "广告费",
      note: "本期平台未生成文件",
      updatedAt: "2026-10-06T02:00:00.000Z",
    },
  ]);

  assert.equal(progress.find((row) => row.exportType === "订单")?.uploadCount, 1);
  assert.equal(progress.find((row) => row.exportType === "广告费")?.specialNote, "本期平台未生成文件");
  assert.equal(progress.find((row) => row.exportType === "收入")?.specialNote, null);
});

test("collection progress counts records beyond the former 200-row client limit", () => {
  const files = Array.from({ length: 205 }, (_, index) => ({
    shop_id: index === 204 ? "target-shop" : "another-shop",
    export_type: "订单",
    created_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
  }));
  const progress = buildCollectionProgress([
    {
      id: "target-shop",
      name: "目标店铺",
      site: "PH",
      platform: "Shopee",
      manager: null,
      export_type: "订单",
    },
  ], files, []);

  assert.equal(progress[0].uploadCount, 1);
  assert.equal(progress[0].lastUploadTime, files[204].created_at);
});
