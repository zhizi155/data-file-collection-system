import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  buildNullableOrExpression,
  FILE_FILTER_FACETS,
  FileFilterFacet,
  FileFilterInput,
  FileFilterParams,
  matchesNullableSelection,
  normalizeFileFilters,
  withoutFileFilterFacet,
} from "@/lib/query-builder";

interface UploadedFileRow {
  id: string;
  original_name: string;
  stored_key: string;
  display_name: string | null;
  file_size: string;
  mime_type: string | null;
  rule_id: string | null;
  shop_id: string | null;
  export_type: string | null;
  created_at: string;
  version: number | null;
  is_current: boolean | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  parse_status: string | null;
}

interface ShopRow {
  id: string;
  name: string;
  site: string;
  platform: string;
  manager: string | null;
}

interface FilesRequestBody extends FileFilterInput {
  limit?: unknown;
  offset?: unknown;
  includeOptions?: unknown;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

function hasShopFilters(filters: FileFilterParams): boolean {
  return filters.shopIds.length > 0
    || filters.platforms.length > 0
    || filters.sites.length > 0
    || filters.managers.length > 0;
}

async function resolveMatchingShops(filters: FileFilterParams): Promise<ShopRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from("shops").select("id, name, site, platform, manager");
  if (filters.shopIds.length > 0) query = query.in("id", filters.shopIds);
  if (filters.platforms.length > 0) query = query.in("platform", filters.platforms);
  if (filters.sites.length > 0) query = query.in("site", filters.sites);
  if (filters.managers.length > 0) query = query.in("manager", filters.managers);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ShopRow[];
}

async function executeFileQuery(
  filters: FileFilterParams,
  matchingShopIds: string[],
  offset?: number,
  limit?: number,
) {
  const supabase = getSupabaseClient();
  let query = supabase.from("uploaded_files").select("*", { count: "exact" });
  if (hasShopFilters(filters)) query = query.in("shop_id", matchingShopIds);
  if (filters.exportTypes.length > 0) query = query.in("export_type", filters.exportTypes);

  const displayExpression = buildNullableOrExpression("display_name", filters.displayNames);
  if (displayExpression) query = query.or(displayExpression);
  if (filters.displayNameContains) query = query.ilike("display_name", `%${filters.displayNameContains}%`);

  const periodExpression = buildNullableOrExpression("period_label", filters.periodLabels);
  if (periodExpression) query = query.or(periodExpression);
  if (filters.periodStart) query = query.gte("period_start", filters.periodStart);
  if (filters.periodEnd) query = query.lte("period_end", filters.periodEnd);

  if (filters.view === "current") {
    query = query.eq("is_current", true).eq("is_deleted", false);
  } else if (filters.view === "history") {
    query = query.eq("is_deleted", false);
  } else if (filters.view === "trash") {
    query = query.eq("is_deleted", true);
  }

  query = query.order("created_at", { ascending: false });
  if (offset !== undefined && limit !== undefined) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(5000);
  }
  return query;
}

function mapWithShops(files: UploadedFileRow[], shops: ShopRow[]) {
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]));
  return files.map((file) => ({
    ...file,
    date_range: file.period_label,
    shops: file.shop_id ? shopsById.get(file.shop_id) ?? null : null,
  }));
}

function matchesStringSelection(value: string | null | undefined, selected: string[]): boolean {
  return selected.length === 0 || (Boolean(value) && selected.includes(value as string));
}

function matchesFilterOptionRow(
  row: UploadedFileRow,
  shop: ShopRow | undefined,
  filters: FileFilterParams,
): boolean {
  return matchesStringSelection(row.shop_id, filters.shopIds)
    && matchesStringSelection(shop?.platform, filters.platforms)
    && matchesStringSelection(shop?.site, filters.sites)
    && matchesNullableSelection(shop?.manager, filters.managers)
    && matchesNullableSelection(row.export_type, filters.exportTypes)
    && matchesNullableSelection(row.display_name, filters.displayNames)
    && matchesNullableSelection(row.period_label, filters.periodLabels);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

async function buildFilterOptions(filters: FileFilterParams) {
  const supabase = getSupabaseClient();
  const baseFilters = FILE_FILTER_FACETS.reduce(
    (current, facet) => withoutFileFilterFacet(current, facet),
    filters,
  );
  const [fileResult, shopResult] = await Promise.all([
    executeFileQuery(baseFilters, []),
    supabase.from("shops").select("id, name, site, platform, manager"),
  ]);
  if (fileResult.error) throw fileResult.error;
  if (shopResult.error) throw shopResult.error;

  const rows = (fileResult.data ?? []) as UploadedFileRow[];
  const allShops = (shopResult.data ?? []) as ShopRow[];
  const shopsById = new Map(allShops.map((shop) => [shop.id, shop]));
  const rowsForFacet = (facet: FileFilterFacet) => {
    const facetFilters = withoutFileFilterFacet(filters, facet);
    return rows.filter((row) => matchesFilterOptionRow(
      row,
      row.shop_id ? shopsById.get(row.shop_id) : undefined,
      facetFilters,
    ));
  };

  const shopOptionIds = new Set(rowsForFacet("shopIds").map((row) => row.shop_id).filter(Boolean));
  const shops = allShops
    .filter((shop) => shopOptionIds.has(shop.id))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const platformRows = rowsForFacet("platforms");
  const siteRows = rowsForFacet("sites");
  const managerRows = rowsForFacet("managers");
  const exportTypeRows = rowsForFacet("exportTypes");
  const displayNameRows = rowsForFacet("displayNames");
  const periodLabelRows = rowsForFacet("periodLabels");

  return {
    shops,
    platforms: uniqueStrings(platformRows.map((row) => row.shop_id ? shopsById.get(row.shop_id)?.platform : null)),
    sites: uniqueStrings(siteRows.map((row) => row.shop_id ? shopsById.get(row.shop_id)?.site : null)),
    managers: uniqueStrings(managerRows.map((row) => row.shop_id ? shopsById.get(row.shop_id)?.manager : null)),
    exportTypes: uniqueStrings(exportTypeRows.map((row) => row.export_type)),
    displayNames: uniqueStrings(displayNameRows.map((row) => row.display_name)),
    periodLabels: uniqueStrings(periodLabelRows.map((row) => row.period_label)).reverse(),
  };
}

async function handleFilesRequest(request: NextRequest, input: FilesRequestBody) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;
  const limit = boundedInteger(input.limit, 20, 1, 200);
  const offset = boundedInteger(input.offset, 0, 0, 1_000_000);
  const filters = normalizeFileFilters(input);
  const matchingShops = await resolveMatchingShops(filters);
  const matchingShopIds = matchingShops.map((shop) => shop.id);

  let rows: UploadedFileRow[] = [];
  let total = 0;
  if (!hasShopFilters(filters) || matchingShopIds.length > 0) {
    const { data, error, count } = await executeFileQuery(filters, matchingShopIds, offset, limit);
    if (error) return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    rows = (data ?? []) as UploadedFileRow[];
    total = count ?? 0;
  }
  const pageShopIds = [...new Set(rows.map((row) => row.shop_id).filter((id): id is string => Boolean(id)))];
  const supabase = getSupabaseClient();
  let pageShops: ShopRow[] = [];
  if (pageShopIds.length > 0) {
    const { data: shopData } = await supabase
      .from("shops")
      .select("id, name, site, platform, manager")
      .in("id", pageShopIds);
    pageShops = (shopData ?? []) as ShopRow[];
  }

  const options = input.includeOptions === false
    ? undefined
    : await buildFilterOptions(filters);
  return NextResponse.json({
    success: true,
    data: mapWithShops(rows, pageShops),
    total,
    limit,
    offset,
    options,
  });
}

export async function GET(request: NextRequest) {
  const input: FilesRequestBody = Object.fromEntries(new URL(request.url).searchParams.entries());
  return handleFilesRequest(request, input);
}

export async function POST(request: NextRequest) {
  try {
    return handleFilesRequest(request, await request.json() as FilesRequestBody);
  } catch {
    return NextResponse.json({ error: "请求参数格式错误" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, "files:delete");
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const ids = [...new Set([
    ...searchParams.getAll("id"),
    ...(searchParams.get("ids")?.split(",") ?? []),
  ].filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ error: "缺少文件ID" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("uploaded_files")
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: auth.session!.userId })
    .in("id", ids)
    .eq("is_deleted", false);
  if (error) return NextResponse.json({ error: `移入回收站失败: ${error.message}` }, { status: 500 });

  await logAudit(supabase, {
    eventType: "file.delete",
    userId: auth.session!.userId,
    username: auth.session!.username,
    targetType: "file",
    targetId: ids.join(","),
    details: { fileCount: ids.length, permanent: false },
    result: "success",
  });
  return NextResponse.json({ success: true, deletedCount: ids.length, message: "已移入回收站" });
}
