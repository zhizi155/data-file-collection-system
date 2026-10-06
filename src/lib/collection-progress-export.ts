import * as XLSX from "xlsx";

import type { CollectionProgressRow } from "@/lib/collection-progress";

export type CollectionProgressStatus = "uploaded" | "missing" | "not_required";

export interface CollectionProgressFilters {
  sites?: string[];
  platforms?: string[];
  managers?: string[];
  status?: CollectionProgressStatus | null;
}

const STATUS_LABELS: Record<CollectionProgressStatus, string> = {
  uploaded: "已上传",
  missing: "未上传",
  not_required: "无文件确认",
};

export function getCollectionProgressStatus(row: CollectionProgressRow): CollectionProgressStatus {
  if (row.uploadCount > 0) return "uploaded";
  return row.specialNote ? "not_required" : "missing";
}

export function filterCollectionProgress(
  rows: CollectionProgressRow[],
  filters: CollectionProgressFilters,
): CollectionProgressRow[] {
  const sites = new Set(filters.sites ?? []);
  const platforms = new Set(filters.platforms ?? []);
  const managers = new Set(filters.managers ?? []);

  return rows.filter((row) => {
    if (sites.size > 0 && !sites.has(row.shopSite)) return false;
    if (platforms.size > 0 && !platforms.has(row.shopPlatform)) return false;
    if (managers.size > 0 && !managers.has(row.shopManager ?? "")) return false;
    if (filters.status && getCollectionProgressStatus(row) !== filters.status) return false;
    return true;
  });
}

function toExcelDate(value: string | null): Date | "" {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

export function createCollectionProgressWorkbook(
  rows: CollectionProgressRow[],
  generatedAt = new Date(),
): XLSX.WorkBook {
  const counts: Record<CollectionProgressStatus, number> = {
    uploaded: 0,
    missing: 0,
    not_required: 0,
  };
  for (const row of rows) counts[getCollectionProgressStatus(row)] += 1;

  const worksheetData: (string | number | Date)[][] = [
    ["数据文件收集进度"],
    ["导出时间", generatedAt],
    [
      `共 ${rows.length} 项；已上传 ${counts.uploaded} 项；未上传 ${counts.missing} 项；无文件确认 ${counts.not_required} 项`,
    ],
    [],
    [
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
    ],
    ...rows.map((row) => [
      row.shopName,
      row.shopSite,
      row.shopPlatform,
      row.shopManager ?? "",
      row.exportType,
      STATUS_LABELS[getCollectionProgressStatus(row)],
      row.uploadCount,
      toExcelDate(row.lastUploadTime),
      row.specialNote ?? "",
      toExcelDate(row.noteUpdatedAt),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData, { cellDates: true });
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:J1"),
    XLSX.utils.decode_range("A3:J3"),
  ];
  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 22 },
    { wch: 42 },
    { wch: 22 },
  ];
  worksheet["!autofilter"] = { ref: `A5:J${Math.max(5, rows.length + 5)}` };

  for (const address of ["B2", ...rows.flatMap((_, index) => [`H${index + 6}`, `J${index + 6}`])]) {
    const cell = worksheet[address];
    if (cell?.t === "d") cell.z = "yyyy-mm-dd hh:mm";
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "收集进度");
  return workbook;
}

export function createCollectionProgressWorkbookBuffer(
  rows: CollectionProgressRow[],
  generatedAt = new Date(),
): Buffer {
  return XLSX.write(createCollectionProgressWorkbook(rows, generatedAt), {
    bookType: "xlsx",
    type: "buffer",
    cellDates: true,
  }) as Buffer;
}
