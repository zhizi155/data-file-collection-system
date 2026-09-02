import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  buildNullableOrExpression,
  FileFilterInput,
  FileFilterParams,
  normalizeFileFilters,
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

function emptyOptions() {
  return { shops: [], platforms: [], sites: [], managers: [], exportTypes: [], displayNames: [], periodLabels: [] };
}

async function buildFilterOptions(filters: FileFilterParams, matchingShopIds: string[]) {
  const supabase = getSupabaseClient();
  const { data } = await executeFileQuery(filters, matchingShopIds);
  const rows = (data ?? []) as UploadedFileRow[];
  const shopIds = [...new Set(rows.map((row) => row.shop_id).filter((id): id is string => Boolean(id)))];
  let shops: ShopRow[] = [];
  if (shopIds.length > 0) {
    const { data: shopData } = await supabase
      .from("shops")
      .select("id, name, site, platform, manager")
      .in("id", shopIds);
    shops = (shopData ?? []) as ShopRow[];
  }
  return {
    shops: shops.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    platforms: [...new Set(shops.map((shop) => shop.platform).filter(Boolean))].sort(),
    sites: [...new Set(shops.map((shop) => shop.site).filter(Boolean))].sort(),
    managers: [...new Set(shops.map((shop) => shop.manager).filter((value): value is string => Boolean(value)))].sort(),
    exportTypes: [...new Set(rows.map((row) => row.export_type).filter((value): value is string => Boolean(value)))].sort(),
    displayNames: [...new Set(rows.map((row) => row.display_name).filter((value): value is string => Boolean(value)))].sort(),
    periodLabels: [...new Set(rows.map((row) => row.period_label).filter((value): value is string => Boolean(value)))].sort().reverse(),
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

  if (hasShopFilters(filters) && matchingShopIds.length === 0) {
    return NextResponse.json({ success: true, data: [], total: 0, options: emptyOptions() });
  }

  const { data, error, count } = await executeFileQuery(filters, matchingShopIds, offset, limit);
  if (error) return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });

  const rows = (data ?? []) as UploadedFileRow[];
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
    : await buildFilterOptions(filters, matchingShopIds);
  return NextResponse.json({
    success: true,
    data: mapWithShops(rows, pageShops),
    total: count ?? 0,
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
