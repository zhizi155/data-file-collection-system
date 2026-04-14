import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import archiver from "archiver";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 批量下载 - 返回ZIP文件
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

    // 创建ZIP文件
    const archive = archiver("zip", { zlib: { level: 9 } });

    // 设置响应头
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `批量下载_${timestamp}.zip`;

    // 收集所有文件数据
    const filePromises = files.map(async (file) => {
      const shop = file.shop_id ? shopsMap[file.shop_id] : null;
      const fileName = file.stored_key.split("/").pop() || file.stored_key;

      // 目录路径：站点/平台/文件名
      const dirPath = `${shop?.site || "未知站点"}/${shop?.platform || "未知平台"}`;

      try {
        // 从存储获取文件内容
        const fileBuffer = await storage.readFile({ fileKey: file.stored_key });

        // 添加到ZIP，路径为：站点/平台/文件名
        archive.append(fileBuffer, { name: `${dirPath}/${fileName}` });

        return { success: true, fileName, dirPath };
      } catch (err) {
        console.error(`处理文件 ${fileName} 失败:`, err);
        return { success: false, fileName, dirPath };
      }
    });

    await Promise.all(filePromises);

    // 完成ZIP打包
    archive.finalize();

    // 返回ZIP文件流
    const chunks: Uint8Array[] = [];

    return new Response(
      new ReadableStream({
        async start(controller) {
          archive.on("data", (chunk) => {
            chunks.push(chunk);
          });

          archive.on("end", () => {
            const buffer = Buffer.concat(chunks);
            controller.enqueue(buffer);
            controller.close();
          });

          archive.on("error", (err) => {
            controller.error(err);
          });
        },
      }),
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      }
    );
  } catch (error) {
    console.error("批量下载失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载失败" },
      { status: 500 }
    );
  }
}
