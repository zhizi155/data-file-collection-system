import { NextRequest, NextResponse } from "next/server";
import {
  buildCollectionProgress,
  CollectionProgressFile,
  CollectionProgressShop,
} from "@/lib/collection-progress";
import { loadCollectionNotes } from "@/lib/collection-notes";
import { getUploadedFilesSchemaMode } from "@/lib/database-capabilities";
import { requirePermission } from "@/lib/rbac";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const FILE_PAGE_SIZE = 1000;

async function loadAllCurrentFiles(): Promise<CollectionProgressFile[]> {
  const supabase = getSupabaseClient();
  const mode = await getUploadedFilesSchemaMode(supabase);
  const files: CollectionProgressFile[] = [];
  const snapshotTime = new Date().toISOString();

  for (let offset = 0; ; offset += FILE_PAGE_SIZE) {
    let query = supabase
      .from("uploaded_files")
      .select("id, shop_id, export_type, created_at")
      .not("shop_id", "is", null)
      .not("export_type", "is", null)
      .lte("created_at", snapshotTime);

    if (mode === "versioned") {
      query = query.eq("is_current", true).eq("is_deleted", false);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + FILE_PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as CollectionProgressFile[];
    files.push(...page);
    if (page.length < FILE_PAGE_SIZE) break;
  }

  return files;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseClient();
    const [shopsResult, files, notes] = await Promise.all([
      supabase
        .from("shops")
        .select("id, name, site, platform, manager, export_type")
        .eq("is_active", true),
      loadAllCurrentFiles(),
      loadCollectionNotes(supabase),
    ]);

    if (shopsResult.error) throw shopsResult.error;
    const shops = (shopsResult.data ?? []) as CollectionProgressShop[];

    return NextResponse.json({
      success: true,
      data: buildCollectionProgress(shops, files, notes),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `收集进度查询失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
