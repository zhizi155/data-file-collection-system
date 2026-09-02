import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import archiver from "archiver";
import { PassThrough } from "stream";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 分批查询辅助函数，避免 URL 过长
async function queryInBatches<T>(
  supabase: ReturnType<typeof getSupabaseClient>,
  table: string,
  column: string,
  ids: string[],
  batchSize: number = 100
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .in(column, batch);
    
    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }
    
    if (data) {
      results.push(...(data as T[]));
    }
  }
  
  return results;
}

// 批量下载 - 返回ZIP文件
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "files:export");
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "缺少文件ID列表" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 使用分批查询获取文件信息，避免 URL 过长
    const files = await queryInBatches<{
      id: string;
      original_name: string;
      display_name: string | null;
      stored_key: string;
      shop_id: string | null;
    }>(supabase, "uploaded_files", "id", fileIds);

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "未找到文件" }, { status: 404 });
    }

    // 获取店铺信息
    const shopIds = [...new Set(files.map((f) => f.shop_id).filter(Boolean))] as string[];
    const shopsMap: Record<string, { name: string; site: string; platform: string }> = {};

    if (shopIds.length > 0) {
      const shopsData = await queryInBatches<{ id: string; name: string; site: string; platform: string }>(
        supabase,
        "shops",
        "id",
        shopIds
      );

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

    // 设置响应头
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `批量下载_${timestamp}.zip`;

    // 创建 PassThrough 流
    const passThrough = new PassThrough();

    // 创建 ZIP 打包器
    const archive = archiver("zip", { zlib: { level: 5 } });

    // 管道连接：archive -> passThrough -> 响应
    archive.pipe(passThrough);

    // 添加文件到 ZIP
    let successCount = 0;
    for (const file of files) {
      const shop = file.shop_id ? shopsMap[file.shop_id] : null;
      // 优先使用 display_name（命名规则生成的文件名），否则使用原始文件名
      const fileName = file.display_name || file.original_name;
      const dirPath = `${shop?.site || "未知站点"}/${shop?.platform || "未知平台"}/${shop?.name || "未知店铺"}`;

      try {
        const fileBuffer = await storage.readFile({ fileKey: file.stored_key });
        archive.append(fileBuffer, { name: `${dirPath}/${fileName}` });
        successCount++;
        console.log(`添加文件: ${dirPath}/${fileName}`);
      } catch (err) {
        console.error(`处理文件 ${fileName} 失败:`, err);
      }
    }

    console.log(`共添加 ${successCount}/${files.length} 个文件`);

    // 完成打包
    archive.finalize();

    // 返回流式响应
    return new Response(passThrough as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("批量下载失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载失败" },
      { status: 500 }
    );
  }
}
