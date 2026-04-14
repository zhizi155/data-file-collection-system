import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取上传文件记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const supabase = getSupabaseClient();
    let query = supabase
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (shopId) {
      query = query.eq("shop_id", shopId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    // 获取店铺信息
    const shopIds = [...new Set(data?.map((f) => f.shop_id).filter(Boolean) || [])];
    let shopsMap: Record<string, { name: string; site: string; platform: string }> = {};

    if (shopIds.length > 0) {
      const { data: shopsData } = await supabase
        .from("shops")
        .select("id, name, site, platform")
        .in("id", shopIds);

      if (shopsData) {
        shopsData.forEach((shop) => {
          shopsMap[shop.id] = {
            name: shop.name,
            site: shop.site,
            platform: shop.platform,
          };
        });
      }
    }

    // 合并数据
    const filesWithShops = data?.map((file) => ({
      ...file,
      shops: file.shop_id ? shopsMap[file.shop_id] || null : null,
    }));

    // 获取总数
    const { count } = await supabase
      .from("uploaded_files")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId || "");

    return NextResponse.json({
      success: true,
      data: filesWithShops,
      total: count || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

// 删除文件记录
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少文件ID" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("uploaded_files").delete().eq("id", id);

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
