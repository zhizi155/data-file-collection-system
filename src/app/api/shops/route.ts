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

// 批量创建店铺（从Excel导入）或单个添加
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shops } = body;

    const supabase = getSupabaseClient();

    if (shops && Array.isArray(shops)) {
      // 批量导入
      const formattedShops = shops.map((shop: { name: string; site: string; platform: string; description?: string; export_type?: string }) => ({
        name: shop.name,
        site: shop.site,
        platform: shop.platform,
        description: shop.description || null,
        export_type: shop.export_type || null,
        is_active: true,
      }));

      const { data, error } = await supabase.from("shops").insert(formattedShops).select();

      if (error) {
        return NextResponse.json({ error: `导入失败: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, data, count: data?.length || 0 });
    } else {
      // 单个添加
      const { name, site, platform, description, export_type } = body;

      if (!name || !site || !platform) {
        return NextResponse.json({ error: "缺少店铺数据" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("shops")
        .insert({
          name,
          site,
          platform,
          description: description || null,
          export_type: export_type || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: `添加失败: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "添加失败" },
      { status: 500 }
    );
  }
}

// 更新店铺
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, site, platform, description, is_active, export_type } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少店铺ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (site !== undefined) updates.site = site;
    if (platform !== undefined) updates.platform = platform;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    if (export_type !== undefined) updates.export_type = export_type;

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
    const ids = searchParams.get("ids"); // 批量删除，多个ID用逗号分隔
    const clearAll = searchParams.get("clearAll") === "true";

    const supabase = getSupabaseClient();

    if (clearAll) {
      // 清空所有店铺
      const { error } = await supabase.from("shops").delete().neq("id", "");
      if (error) {
        return NextResponse.json({ error: `清空失败: ${error.message}` }, { status: 500 });
      }
    } else if (ids) {
      // 批量删除
      const idArray = ids.split(",").filter(Boolean);
      if (idArray.length === 0) {
        return NextResponse.json({ error: "缺少店铺ID" }, { status: 400 });
      }
      const { error } = await supabase.from("shops").delete().in("id", idArray);
      if (error) {
        return NextResponse.json({ error: `批量删除失败: ${error.message}` }, { status: 500 });
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
