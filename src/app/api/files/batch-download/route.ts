import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 批量获取下载链接
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "缺少文件ID列表" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 查询文件信息和店铺信息
    const { data: files, error } = await supabase
      .from("uploaded_files")
      .select("*")
      .in("id", fileIds);

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "未找到文件" }, { status: 404 });
    }

    // 获取店铺信息
    const shopIds = [...new Set(files.map((f) => f.shop_id).filter(Boolean))];
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

    // 生成每个文件的下载信息
    const downloadList = await Promise.all(
      files.map(async (file) => {
        const shop = file.shop_id ? shopsMap[file.shop_id] : null;
        const fileName = file.stored_key.split("/").pop() || file.stored_key;

        // 生成签名下载URL
        const signedUrl = await storage.generatePresignedUrl({
          key: file.stored_key,
          expireTime: 3600,
        });

        return {
          id: file.id,
          originalName: file.original_name,
          storedKey: file.stored_key,
          fileName: fileName,
          shopName: shop?.name || "",
          shopSite: shop?.site || "",
          shopPlatform: shop?.platform || "",
          // 目录路径：站点/平台/文件名
          directoryPath: `${shop?.site || "未知站点"}/${shop?.platform || "未知平台"}`,
          downloadUrl: signedUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: downloadList,
    });
  } catch (error) {
    console.error("批量获取下载链接失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取下载链接失败" },
      { status: 500 }
    );
  }
}
