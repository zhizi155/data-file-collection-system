import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 确认上传完成并记录到数据库
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { objectKey, originalName, fileSize, shopId, exportType, ruleId, displayName } = body;

    if (!objectKey || !originalName || !fileSize) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 获取文件信息
    // 注意：如果使用中文 displayName（保存类型），需要构造正确的文件名
    const ext = (originalName || objectKey).split(".").pop() || "";
    const finalDisplayName = exportType
      ? `${exportType}${ext ? '.' + ext : ''}`
      : (displayName || objectKey.split("/").pop() || originalName);

    // 检查是否已存在相同店铺、相同保存文件类型的文件
    const supabase = getSupabaseClient();
    if (shopId && exportType) {
      const { data: existingFiles } = await supabase
        .from("uploaded_files")
        .select("id, stored_key")
        .eq("shop_id", shopId)
        .eq("export_type", exportType);

      if (existingFiles && existingFiles.length > 0) {
        // 删除旧的存储文件
        for (const oldFile of existingFiles) {
          try {
            await storage.deleteFile({ fileKey: oldFile.stored_key });
          } catch (err) {
            console.warn("删除旧文件失败:", err);
          }
        }
        // 删除旧的数据库记录
        await supabase
          .from("uploaded_files")
          .delete()
          .in("id", existingFiles.map((f: { id: string }) => f.id));
      }
    }

    // 记录到数据库
    const { error: insertError } = await supabase.from("uploaded_files").insert({
      original_name: originalName,
      stored_key: objectKey,
      display_name: finalDisplayName, // 保存中文保存类型作为显示名
      file_size: fileSize.toString(),
      mime_type: "application/octet-stream",
      rule_id: ruleId || null,
      shop_id: shopId || null,
      export_type: exportType || null,
    });

    if (insertError) {
      console.error("记录上传文件失败:", insertError);
      return NextResponse.json(
        { error: "记录文件信息失败" },
        { status: 500 }
      );
    }

    // 生成访问链接
    const fileUrl = await storage.generatePresignedUrl({
      key: objectKey,
      expireTime: 86400 * 7,
    });

    return NextResponse.json({
      success: true,
      originalName: originalName,
      newName: finalDisplayName,
      fileKey: objectKey,
      fileUrl: fileUrl,
      fileSize: fileSize,
    });
  } catch (error) {
    console.error("确认上传失败:", error);
    return NextResponse.json(
      { error: "确认上传失败" },
      { status: 500 }
    );
  }
}
