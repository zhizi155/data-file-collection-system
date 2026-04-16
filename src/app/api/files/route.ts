import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { smartExtractDateRange } from "@/lib/date-utils";

// 获取上传文件记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const platform = searchParams.get("platform");
    const site = searchParams.get("site");
    const dateRange = searchParams.get("dateRange"); // 日期区间文本筛选
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const supabase = getSupabaseClient();

    // 先获取需要筛选的店铺ID列表
    let filterShopIds: string[] | null = null;
    // 解析逗号分隔的多选值
    const shopIdList = shopId ? shopId.split(",").filter(Boolean) : [];
    const platformList = platform ? platform.split(",").filter(Boolean) : [];
    const siteList = site ? site.split(",").filter(Boolean) : [];
    
    if (platformList.length > 0 || siteList.length > 0) {
      let shopQuery = supabase.from("shops").select("id");
      if (platformList.length > 0) {
        shopQuery = shopQuery.in("platform", platformList);
      }
      if (siteList.length > 0) {
        shopQuery = shopQuery.in("site", siteList);
      }
      const { data: filteredShops } = await shopQuery;
      if (filteredShops && filteredShops.length > 0) {
        filterShopIds = filteredShops.map((s) => s.id);
      } else if (platformList.length > 0 || siteList.length > 0) {
        // 如果有筛选条件但没找到店铺，返回空结果
        return NextResponse.json({
          success: true,
          data: [],
          total: 0,
        });
      }
    }

    // 构建查询
    let query = supabase
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false });

    if (shopIdList.length > 0) {
      query = query.in("shop_id", shopIdList);
    } else if (filterShopIds && filterShopIds.length > 0) {
      query = query.in("shop_id", filterShopIds);
    }

    // 获取总数
    let countQuery = supabase
      .from("uploaded_files")
      .select("*", { count: "exact", head: true });

    if (shopIdList.length > 0) {
      countQuery = countQuery.in("shop_id", shopIdList);
    } else if (filterShopIds && filterShopIds.length > 0) {
      countQuery = countQuery.in("shop_id", filterShopIds);
    }

    const [queryResult, countResult] = await Promise.all([
      query.range(offset, offset + limit - 1),
      countQuery,
    ]);

    let data = queryResult.data;
    const error = queryResult.error;

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    // 获取店铺信息
    const allShopIds = [...new Set(data?.map((f) => f.shop_id).filter(Boolean) || [])];
    const shopsMap: Record<string, { name: string; site: string; platform: string }> = {};

    if (allShopIds.length > 0) {
      const { data: shopsData } = await supabase
        .from("shops")
        .select("id, name, site, platform")
        .in("id", allShopIds);

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

    // 合并数据并添加日期区间识别
    let filesWithShops = data?.map((file) => ({
      ...file,
      shops: file.shop_id ? shopsMap[file.shop_id] || null : null,
      date_range: smartExtractDateRange(file.original_name),
    })) || [];

    // 日期区间文本筛选（在内存中筛选，因为 date_range 是计算字段）
    const dateRangeList = dateRange ? dateRange.split(",").filter(Boolean) : [];
    const includeNone = dateRangeList.includes("__NONE__");
    const filteredDateRanges = dateRangeList.filter((dr) => dr !== "__NONE__");
    
    if (dateRangeList.length > 0) {
      filesWithShops = filesWithShops.filter((file) => {
        // 只有"未识别"选项：筛选 date_range 为 null 的记录
        if (includeNone && filteredDateRanges.length === 0) {
          return file.date_range === null;
        }
        // 既有"未识别"又有其他筛选条件
        if (includeNone && filteredDateRanges.length > 0) {
          // 文件必须：date_range 为 null 或 匹配其他筛选条件之一
          if (file.date_range === null) return true;
          return filteredDateRanges.some((dr) => file.date_range?.toLowerCase().includes(dr.toLowerCase()));
        }
        // 只有其他筛选条件（不含"未识别"）
        if (filteredDateRanges.length > 0) {
          return filteredDateRanges.some((dr) => file.date_range?.toLowerCase().includes(dr.toLowerCase()));
        }
        return true;
      });
    }

    // 获取过滤后的总数（用于分页）
    let filteredTotal = countResult.count || 0;
    if (dateRangeList.length > 0) {
      // 重新计算符合条件的总数
      let allQuery = supabase
        .from("uploaded_files")
        .select("original_name", { count: "exact", head: true });

      if (shopIdList.length > 0) {
        allQuery = allQuery.in("shop_id", shopIdList);
      } else if (filterShopIds && filterShopIds.length > 0) {
        allQuery = allQuery.in("shop_id", filterShopIds);
      }

      const { data: allFiles } = await allQuery;
      const allWithDateRange = allFiles?.map((file) => smartExtractDateRange(file.original_name)) || [];
      filteredTotal = allWithDateRange.filter((dr) => {
        // 只有"未识别"选项：date_range 为 null
        if (includeNone && filteredDateRanges.length === 0) {
          return dr === null;
        }
        // 既有"未识别"又有其他筛选条件
        if (includeNone && filteredDateRanges.length > 0) {
          if (dr === null) return true;
          return filteredDateRanges.some((range) => dr?.toLowerCase().includes(range.toLowerCase()));
        }
        // 只有其他筛选条件（不含"未识别"）
        if (filteredDateRanges.length > 0) {
          return filteredDateRanges.some((range) => dr?.toLowerCase().includes(range.toLowerCase()));
        }
        return true;
      }).length;
    }

    return NextResponse.json({
      success: true,
      data: filesWithShops,
      total: filteredTotal,
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
