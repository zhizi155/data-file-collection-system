import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const supabase = getSupabaseClient();

// 获取所有导出类型
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("export_types")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("获取导出类型失败:", error);
    return NextResponse.json({ success: false, error: "获取失败" }, { status: 500 });
  }
}

// 创建导出类型
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "名称不能为空" }, { status: 400 });
    }

    // 检查是否已存在
    const { data: existing } = await supabase
      .from("export_types")
      .select("id")
      .eq("name", name.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: "该导出类型已存在" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("export_types")
      .insert({ name: name.trim(), description: description?.trim() || null })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("创建导出类型失败:", error);
    return NextResponse.json({ success: false, error: "创建失败" }, { status: 500 });
  }
}

// 更新导出类型
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少ID" }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "名称不能为空" }, { status: 400 });
    }

    // 检查是否与其他记录重名
    const { data: existing } = await supabase
      .from("export_types")
      .select("id")
      .eq("name", name.trim())
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: "该名称已被使用" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("export_types")
      .update({ name: name.trim(), description: description?.trim() || null })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("更新导出类型失败:", error);
    return NextResponse.json({ success: false, error: "更新失败" }, { status: 500 });
  }
}

// 删除导出类型
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少ID" }, { status: 400 });
    }

    const { error } = await supabase.from("export_types").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除导出类型失败:", error);
    return NextResponse.json({ success: false, error: "删除失败" }, { status: 500 });
  }
}
