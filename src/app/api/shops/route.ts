import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取所有店铺
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    const supabase = getSupabaseClient();
    let query = supabase.from("shops").select("*").order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

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

// 批量创建店铺（从Excel导入）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shops } = body;

    if (!shops || !Array.isArray(shops)) {
      return NextResponse.json({ error: "缺少店铺数据" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 格式化数据
    const formattedShops = shops.map((shop: { name: string; site: string; platform: string; description?: string }) => ({
      name: shop.name,
      site: shop.site,
      platform: shop.platform,
      description: shop.description || null,
      is_active: true,
    }));

    // 先清空现有店铺（可选，根据需求）
    // await supabase.from("shops").delete().neq("id", "");

    const { data, error } = await supabase.from("shops").insert(formattedShops).select();

    if (error) {
      return NextResponse.json({ error: `导入失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, count: data?.length || 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 500 }
    );
  }
}

// 更新店铺
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, site, platform, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少店铺ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (site !== undefined) updates.site = site;
    if (platform !== undefined) updates.platform = platform;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("shops")
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

// 删除店铺
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    const supabase = getSupabaseClient();

    if (clearAll) {
      // 清空所有店铺
      const { error } = await supabase.from("shops").delete().neq("id", "");
      if (error) {
        return NextResponse.json({ error: `清空失败: ${error.message}` }, { status: 500 });
      }
    } else if (id) {
      const { error } = await supabase.from("shops").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: `删除失败: ${error.message}` }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "缺少店铺ID或清空标识" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
