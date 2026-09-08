/**
 * 上传记录、导出任务和收集进度共用的筛选协议。
 * 同一字段内使用 OR，不同字段之间使用 AND。
 */

export const NULL_FILTER_VALUE = "__NONE__";

export type FileView = "current" | "history" | "trash" | "all";

export interface FileFilterParams {
  shopIds: string[];
  platforms: string[];
  sites: string[];
  exportTypes: string[];
  displayNames: string[];
  displayNameContains: string;
  periodLabels: string[];
  periodStart: string;
  periodEnd: string;
  managers: string[];
  view: FileView;
}

export type FileFilterFacet =
  | "shopIds"
  | "platforms"
  | "sites"
  | "exportTypes"
  | "displayNames"
  | "periodLabels"
  | "managers";

/**
 * 生成某个筛选项的候选值时，忽略该筛选项自身的已选值。
 * 这样同一字段内可以继续多选，同时仍保留其他字段之间的联动过滤。
 */
export function withoutFileFilterFacet(
  filters: FileFilterParams,
  facet: FileFilterFacet,
): FileFilterParams {
  return { ...filters, [facet]: [] };
}

export interface FileFilterInput {
  shopId?: unknown;
  shopIds?: unknown;
  platform?: unknown;
  platforms?: unknown;
  site?: unknown;
  sites?: unknown;
  exportType?: unknown;
  exportTypes?: unknown;
  displayName?: unknown;
  displayNames?: unknown;
  displayNameContains?: unknown;
  dateRange?: unknown;
  periodLabels?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  manager?: unknown;
  managers?: unknown;
  view?: unknown;
  includeDeleted?: unknown;
  includeHistory?: unknown;
}

export function toStringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [...new Set(values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeView(input: FileFilterInput): FileView {
  if (["current", "history", "trash", "all"].includes(String(input.view))) {
    return input.view as FileView;
  }
  if (input.includeDeleted === true) return "trash";
  if (input.includeHistory === true) return "history";
  return "current";
}

export function normalizeFileFilters(input: FileFilterInput = {}): FileFilterParams {
  return {
    shopIds: toStringArray(input.shopIds ?? input.shopId),
    platforms: toStringArray(input.platforms ?? input.platform),
    sites: toStringArray(input.sites ?? input.site),
    exportTypes: toStringArray(input.exportTypes ?? input.exportType),
    displayNames: toStringArray(input.displayNames ?? input.displayName),
    displayNameContains: toTrimmedString(input.displayNameContains),
    periodLabels: toStringArray(input.periodLabels ?? input.dateRange),
    periodStart: toTrimmedString(input.periodStart),
    periodEnd: toTrimmedString(input.periodEnd),
    managers: toStringArray(input.managers ?? input.manager),
    view: normalizeView(input),
  };
}

export function splitNullableSelection(values: string[]): {
  includeNull: boolean;
  values: string[];
} {
  return {
    includeNull: values.includes(NULL_FILTER_VALUE),
    values: values.filter((value) => value !== NULL_FILTER_VALUE),
  };
}

export function matchesNullableSelection(
  value: string | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const { includeNull, values } = splitNullableSelection(selected);
  if (value == null || value === "") return includeNull;
  return values.includes(value);
}

/** PostgREST or() 中的值需要双引号与反斜杠转义。 */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildNullableOrExpression(column: string, selected: string[]): string | null {
  const { includeNull, values } = splitNullableSelection(selected);
  const expressions: string[] = [];
  if (includeNull) expressions.push(`${column}.is.null`);
  if (values.length > 0) {
    expressions.push(`${column}.in.(${values.map(quotePostgrestValue).join(",")})`);
  }
  return expressions.length > 0 ? expressions.join(",") : null;
}

export function sanitizeArchiveSegment(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return sanitized || "未命名";
}

export function createUniqueArchivePath(
  desiredPath: string,
  usedPaths: Set<string>,
): string {
  const normalized = desiredPath
    .split(/[\\/]+/)
    .map(sanitizeArchiveSegment)
    .join("/");
  const lower = normalized.toLocaleLowerCase();
  if (!usedPaths.has(lower)) {
    usedPaths.add(lower);
    return normalized;
  }

  const dot = normalized.lastIndexOf(".");
  const base = dot > normalized.lastIndexOf("/") ? normalized.slice(0, dot) : normalized;
  const extension = dot > normalized.lastIndexOf("/") ? normalized.slice(dot) : "";
  let index = 2;
  while (usedPaths.has(`${base}_${index}${extension}`.toLocaleLowerCase())) index += 1;
  const unique = `${base}_${index}${extension}`;
  usedPaths.add(unique.toLocaleLowerCase());
  return unique;
}
