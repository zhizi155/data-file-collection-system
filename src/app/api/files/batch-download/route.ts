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
    const shopsMap: Record<string, { name: string; site: string; platform: string }> = {};

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
    const archive = archiver("zip", { zlib: { level: 5 } });

    // 设置响应头
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `批量下载_${timestamp}.zip`;

    // 创建一个 Promise 来等待 archive 完成
    let archiveResolve: () => void;
    let archiveReject: (err: Error) => void;
    const archivePromise = new Promise<void>((resolve, reject) => {
      archiveResolve = resolve;
      archiveReject = reject;
    });

    // 先设置事件监听器，再进行其他操作
    archive.on("close", () => {
      console.log(`ZIP打包完成，总大小: ${archive.pointer()} bytes`);
      archiveResolve!();
    });

    archive.on("error", (err) => {
      console.error("ZIP打包错误:", err);
      archiveReject(err);
    });

    // 收集所有文件数据
    const filePromises = files.map(async (file) => {
      const shop = file.shop_id ? shopsMap[file.shop_id] : null;
      const fileName = file.stored_key.split("/").pop() || file.stored_key;

      // 目录路径：站点/平台/店铺名/文件名
      const dirPath = `${shop?.site || "未知站点"}/${shop?.platform || "未知平台"}/${shop?.name || "未知店铺"}`;

      try {
        // 从存储获取文件内容
        const fileBuffer = await storage.readFile({ fileKey: file.stored_key });

        // 添加到ZIP，路径为：站点/平台/店铺名/文件名
        archive.append(fileBuffer, { name: `${dirPath}/${fileName}` });

        console.log(`已添加文件到ZIP: ${dirPath}/${fileName}`);
        return { success: true, fileName, dirPath };
      } catch (err) {
        console.error(`处理文件 ${fileName} 失败:`, err);
        return { success: false, fileName, dirPath };
      }
    });

    // 等待所有文件读取完成
    await Promise.all(filePromises);

    // 完成ZIP打包
    archive.finalize();

    // 等待 archive 完成
    await archivePromise;

    // 创建流式响应
    const stream = new ReadableStream({
      start(controller) {
        archive.on("data", (chunk: Buffer) => {
          controller.enqueue(chunk);
        });

        archive.on("end", () => {
          controller.close();
        });

        archive.on("error", (err: Error) => {
          controller.error(err);
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
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
