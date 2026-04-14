import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取所有自定义变量
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("custom_variables")
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

// 创建自定义变量
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, value, description } = body;

    if (!name || !value) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 检查变量名格式
    const varName = name.trim();
    if (!varName.startsWith("{") || !varName.endsWith("}")) {
      return NextResponse.json({ error: "变量名必须以 { 开头，以 } 结尾" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("custom_variables")
      .insert({
        name: varName,
        value: value.trim(),
        description: description || null,
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

// 更新自定义变量
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, value, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少变量ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      const varName = name.trim();
      if (!varName.startsWith("{") || !varName.endsWith("}")) {
        return NextResponse.json({ error: "变量名必须以 { 开头，以 } 结尾" }, { status: 400 });
      }
      updates.name = varName;
    }
    if (value !== undefined) updates.value = value.trim();
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("custom_variables")
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

// 删除自定义变量
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少变量ID" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("custom_variables").delete().eq("id", id);

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
