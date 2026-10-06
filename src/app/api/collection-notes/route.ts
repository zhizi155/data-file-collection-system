import { NextRequest, NextResponse } from "next/server";
import {
  createCollectionNoteKey,
  createCollectionNoteMetadata,
  loadCollectionNotes,
} from "@/lib/collection-notes";
import { requirePermission } from "@/lib/rbac";
import { getSupabaseClient } from "@/storage/database/supabase-client";

interface NoteInput {
  shopId?: unknown;
  exportType?: unknown;
  note?: unknown;
}

type NormalizedNoteInput = ReturnType<typeof normalizeInput>;

function normalizeInput(input: NoteInput) {
  return {
    shopId: typeof input.shopId === "string" ? input.shopId.trim() : "",
    exportType: typeof input.exportType === "string" ? input.exportType.trim() : "",
    note: typeof input.note === "string" ? input.note.trim() : "",
  };
}

async function validateShopExportType(shopId: string, exportType: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shops")
    .select("export_type")
    .eq("id", shopId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return "店铺不存在";
  const exportTypes = String(data.export_type ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
  return exportTypes.includes(exportType) ? null : "该店铺未配置此收集类型";
}

async function persistNote(input: NormalizedNoteInput) {
  if (!input.shopId || !input.exportType || !input.note) {
    return { error: "店铺、收集类型和备注均不能为空", status: 400 as const };
  }
  if (input.note.length > 500) {
    return { error: "备注最多 500 个字符", status: 400 as const };
  }

  const validationError = await validateShopExportType(input.shopId, input.exportType);
  if (validationError) return { error: validationError, status: 400 as const };

  const now = new Date().toISOString();
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("custom_variables").upsert({
    name: createCollectionNoteKey(input.shopId, input.exportType),
    value: input.note,
    description: createCollectionNoteMetadata(input.shopId, input.exportType),
    is_active: true,
    updated_at: now,
  }, { onConflict: "name" });

  if (error) throw error;
  return { data: { ...input, updatedAt: now } };
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;

  try {
    return NextResponse.json({
      success: true,
      data: await loadCollectionNotes(getSupabaseClient()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `备注查询失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, "shops:manage");
  if (auth.error) return auth.error;

  try {
    const input = normalizeInput(await request.json() as NoteInput);
    const result = await persistNote(input);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: `备注保存失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}

// 上传页无需登录；仅允许给系统中真实存在的店铺及其已配置收集类型提交确认。
export async function POST(request: NextRequest) {
  try {
    const input = normalizeInput(await request.json() as NoteInput);
    const result = await persistNote(input);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: `无文件确认失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, "shops:manage");
  if (auth.error) return auth.error;

  try {
    const input = normalizeInput(await request.json() as NoteInput);
    if (!input.shopId || !input.exportType) {
      return NextResponse.json({ error: "缺少店铺或收集类型" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("custom_variables")
      .delete()
      .eq("name", createCollectionNoteKey(input.shopId, input.exportType));

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `备注清除失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
