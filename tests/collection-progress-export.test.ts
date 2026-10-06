import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type { CollectionProgressRow } from "../src/lib/collection-progress";
import {
  createCollectionProgressWorkbookBuffer,
  filterCollectionProgress,
} from "../src/lib/collection-progress-export";

const rows: CollectionProgressRow[] = [
  {
    shopId: "shop-uploaded",
    shopName: "已上传店铺",
    shopSite: "PH",
    shopPlatform: "Shopee",
    shopManager: "张三",
    exportType: "订单",
    uploadCount: 2,
    lastUploadTime: "2026-10-06T01:00:00.000Z",
    specialNote: null,
    noteUpdatedAt: null,
  },
  {
    shopId: "shop-no-file",
    shopName: "无文件店铺",
    shopSite: "PH",
    shopPlatform: "Shopee",
    shopManager: "李四",
    exportType: "广告费",
    uploadCount: 0,
    lastUploadTime: null,
    specialNote: "本期平台未生成文件",
    noteUpdatedAt: "2026-10-06T02:00:00.000Z",
  },
  {
    shopId: "shop-missing",
    shopName: "未上传店铺",
    shopSite: "MY",
    shopPlatform: "Lazada",
    shopManager: null,
    exportType: "收入",
    uploadCount: 0,
    lastUploadTime: null,
    specialNote: null,
    noteUpdatedAt: null,
  },
];

test("collection progress export applies the current filters", () => {
  assert.deepEqual(
    filterCollectionProgress(rows, { sites: ["PH"], managers: ["李四"], status: "not_required" }),
    [rows[1]],
  );
  assert.deepEqual(
    filterCollectionProgress(rows, { platforms: ["Lazada"], status: "missing" }),
    [rows[2]],
  );
});

test("collection progress workbook includes all statuses and no-file details", () => {
  const buffer = createCollectionProgressWorkbookBuffer(rows, new Date("2026-10-06T03:00:00.000Z"));
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  assert.deepEqual(workbook.SheetNames, ["收集进度"]);

  const sheet = workbook.Sheets["收集进度"];
  const values = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
    header: 1,
    raw: true,
  });

  assert.deepEqual(values[4], [
    "店铺名称",
    "站点",
    "平台",
    "负责人",
    "收集类型",
    "收集状态",
    "上传数量",
    "最后上传时间",
    "特殊备注",
    "无文件确认时间",
  ]);
  assert.equal(values[5][5], "已上传");
  assert.equal(values[6][5], "无文件确认");
  assert.equal(values[6][8], "本期平台未生成文件");
  assert.ok(values[6][9] instanceof Date);
  assert.equal(values[7][5], "未上传");
  assert.match(String(values[2][0]), /已上传 1 项；未上传 1 项；无文件确认 1 项/);
});
