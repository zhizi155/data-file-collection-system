import { NextRequest, NextResponse } from "next/server";

import {
  createCollectionProgressWorkbookBuffer,
  filterCollectionProgress,
  type CollectionProgressStatus,
} from "@/lib/collection-progress-export";
import { loadCollectionProgress } from "@/lib/collection-progress-server";
import { requirePermission } from "@/lib/rbac";

const VALID_STATUSES = new Set<CollectionProgressStatus>([
  "uploaded",
  "missing",
  "not_required",
]);

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:export");
  if (auth.error) return auth.error;

  try {
    const rawStatus = request.nextUrl.searchParams.get("status");
    if (rawStatus && !VALID_STATUSES.has(rawStatus as CollectionProgressStatus)) {
      return NextResponse.json({ error: "无效的收集状态筛选值" }, { status: 400 });
    }

    const rows = filterCollectionProgress(await loadCollectionProgress(), {
      sites: uniqueValues(request.nextUrl.searchParams.getAll("site")),
      platforms: uniqueValues(request.nextUrl.searchParams.getAll("platform")),
      managers: uniqueValues(request.nextUrl.searchParams.getAll("manager")),
      status: rawStatus as CollectionProgressStatus | null,
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "当前筛选条件下没有可导出的收集进度" }, { status: 400 });
    }

    const generatedAt = new Date();
    const buffer = createCollectionProgressWorkbookBuffer(rows, generatedAt);
    const datePart = generatedAt.toISOString().slice(0, 10);
    const filename = `数据文件收集进度_${datePart}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `收集进度导出失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
