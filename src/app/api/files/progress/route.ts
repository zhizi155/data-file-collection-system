import { NextRequest, NextResponse } from "next/server";
import { loadCollectionProgress } from "@/lib/collection-progress-server";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;

  try {
    return NextResponse.json({
      success: true,
      data: await loadCollectionProgress(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `收集进度查询失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
