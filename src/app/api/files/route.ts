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
    const displayName = searchParams.get("displayName"); // 保存文件名筛选
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const getAll = searchParams.get("getAll") === "true"; // 是否获取所有数据（用于联动选项计算）

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

    // 解析筛选参数
    const dateRangeList = dateRange ? dateRange.split(",").filter(Boolean) : [];
    const includeNone = dateRangeList.includes("__NONE__");
    const filteredDateRanges = dateRangeList.filter((dr) => dr !== "__NONE__");
    
    const displayNameList = displayName ? displayName.split(",").filter(Boolean) : [];
    const includeNoneDisplay = displayNameList.includes("__NONE__");
    const filteredDisplayNames = displayNameList.filter((dn) => dn !== "__NONE__");

    // 构建店铺筛选后的查询
    let shopFilteredQuery = supabase
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false });

    // 应用店铺筛选条件
    if (shopIdList.length > 0) {
      shopFilteredQuery = shopFilteredQuery.in("shop_id", shopIdList);
    } else if (filterShopIds && filterShopIds.length > 0) {
      shopFilteredQuery = shopFilteredQuery.in("shop_id", filterShopIds);
    }

    // 获取店铺筛选后的所有数据（用于内存筛选）
    const { data: shopFilteredData, error } = await shopFilteredQuery;

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    // 获取店铺信息
    const allShopIds = [...new Set(shopFilteredData?.map((f) => f.shop_id).filter(Boolean) || [])];
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
    let filesWithShops = shopFilteredData?.map((file) => ({
      ...file,
      shops: file.shop_id ? shopsMap[file.shop_id] || null : null,
      date_range: smartExtractDateRange(file.original_name),
    })) || [];

    // 获取店铺筛选后的总数
    let filteredTotal = filesWithShops.length;

    // 应用日期区间和保存文件名筛选（在内存中筛选，因为 date_range 是计算字段）
    // 注意：getAll=true 时不应用这些筛选，用于计算联动选项
    if (!getAll) {
      // 日期区间文本筛选
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

      // 保存文件名筛选
      if (displayNameList.length > 0) {
        filesWithShops = filesWithShops.filter((file) => {
          const fileDisplayName = file.display_name || null;
          // 只有"未识别"选项：筛选 display_name 为 null 的记录
          if (includeNoneDisplay && filteredDisplayNames.length === 0) {
            return fileDisplayName === null;
          }
          // 既有"未识别"又有其他筛选条件
          if (includeNoneDisplay && filteredDisplayNames.length > 0) {
            if (fileDisplayName === null) return true;
            return filteredDisplayNames.some((dn) => fileDisplayName?.toLowerCase().includes(dn.toLowerCase()));
          }
          // 只有其他筛选条件（不含"未识别"）
          if (filteredDisplayNames.length > 0) {
            return filteredDisplayNames.some((dn) => fileDisplayName?.toLowerCase().includes(dn.toLowerCase()));
          }
          return true;
        });
      }

      // 更新筛选后的总数
      filteredTotal = filesWithShops.length;

      // 应用分页（先筛选后分页）
      filesWithShops = filesWithShops.slice(offset, offset + limit);
    }

    if (getAll) {
      // 获取所有数据时返回，不带分页信息
      return NextResponse.json({
        success: true,
        data: filesWithShops,
      });
    }

    return NextResponse.json({
      success: true,
      data: filesWithShops,
      total: filteredTotal,
    });
  } catch (error) {
    console.error("获取上传文件记录失败:", error);
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
