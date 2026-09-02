import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/rbac";

// 获取所有命名规则
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("naming_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

// 创建新命名规则
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "rules:manage");
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { name, pattern, description, export_type } = body;

    if (!name || !pattern) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("naming_rules")
      .insert({
        name,
        pattern,
        description: description || null,
        export_type: export_type || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `创建失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}

// 更新命名规则
export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, "rules:manage");
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { id, name, pattern, description, is_active, export_type } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少规则ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (pattern !== undefined) updates.pattern = pattern;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    if (export_type !== undefined) updates.export_type = export_type;
    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("naming_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 }
    );
  }
}

// 删除命名规则
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, "rules:manage");
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少规则ID" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("naming_rules").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: `删除失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
