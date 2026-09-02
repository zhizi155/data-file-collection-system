import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSessionUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { parseDateFromFilename } from "@/lib/date-parser";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 确认上传完成并记录到数据库（支持版本化）
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  
  try {
    const body = await request.json();
    const { 
      objectKey, 
      originalName, 
      fileSize, 
      shopId, 
      exportType, 
      ruleId, 
      displayName,
      checksum 
    } = body;

    if (!objectKey || !originalName || !fileSize) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 构造显示名
    const ext = (originalName || objectKey).split(".").pop() || "";
    const finalDisplayName = exportType
      ? `${exportType}${ext ? '.' + ext : ''}`
      : (displayName || objectKey.split("/").pop() || originalName);

    // 解析归属期间
    const parsedPeriod = parseDateFromFilename(originalName);

    // 查询当前版本
    let newVersion = 1;
    let existingCurrentId: string | null = null;

    if (shopId && exportType) {
      const { data: currentFile } = await supabase
        .from("uploaded_files")
        .select("id, version")
        .eq("shop_id", shopId)
        .eq("export_type", exportType)
        .eq("is_current", true)
        .eq("is_deleted", false)
        .single();

      if (currentFile) {
        newVersion = currentFile.version + 1;
        existingCurrentId = currentFile.id;
      }
    }

    // 将旧版本标记为非当前
    if (existingCurrentId) {
      await supabase
        .from("uploaded_files")
        .update({ 
          is_current: false, 
          superseded_at: new Date().toISOString() 
        })
        .eq("id", existingCurrentId);
    }

    // 插入新版本记录
    const { data: newFile, error: insertError } = await supabase
      .from("uploaded_files")
      .insert({
        original_name: originalName,
        stored_key: objectKey,
        display_name: finalDisplayName,
        file_size: fileSize.toString(),
        mime_type: "application/octet-stream",
        rule_id: ruleId || null,
        shop_id: shopId || null,
        export_type: exportType || null,
        // 版本化字段
        version: newVersion,
        is_current: true,
        uploaded_by: user?.userId || null,
        checksum: checksum || null,
        // 归属期间字段
        period_start: parsedPeriod?.start || null,
        period_end: parsedPeriod?.end || null,
        period_label: parsedPeriod?.label || null,
        parse_status: parsedPeriod?.status || 'pending',
        parse_source: parsedPeriod?.source || 'filename',
      })
      .select()
      .single();

    if (insertError) {
      console.error("记录上传文件失败:", insertError);
      // 清理已上传的对象
      try {
        await storage.deleteFile({ fileKey: objectKey });
      } catch {
        // 忽略清理错误
      }
      return NextResponse.json(
        { error: "记录文件信息失败" },
        { status: 500 }
      );
    }

    // 记录审计日志
    await logAudit(supabase, {
      eventType: 'file.upload',
      userId: user?.userId,
      username: user?.username,
      targetType: 'file',
      targetId: newFile?.id,
      details: {
        originalName,
        displayName: finalDisplayName,
        fileSize,
        shopId,
        exportType,
        version: newVersion,
        isVersionUpgrade: existingCurrentId !== null
      },
      result: 'success'
    });

    // 生成访问链接
    const fileUrl = await storage.generatePresignedUrl({
      key: objectKey,
      expireTime: 86400 * 7,
    });

    return NextResponse.json({
      success: true,
      id: newFile?.id,
      originalName: originalName,
      newName: finalDisplayName,
      fileKey: objectKey,
      fileUrl: fileUrl,
      fileSize: fileSize,
      version: newVersion,
      isVersionUpgrade: existingCurrentId !== null,
      period: parsedPeriod ? {
        start: parsedPeriod.start,
        end: parsedPeriod.end,
        label: parsedPeriod.label,
        status: parsedPeriod.status
      } : null
    });
  } catch (error) {
    console.error("确认上传失败:", error);
    
    // 记录审计日志
    await logAudit(getSupabaseClient(), {
      eventType: 'file.upload',
      userId: user?.userId,
      username: user?.username,
      result: 'failure',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json(
      { error: "确认上传失败" },
      { status: 500 }
    );
  }
}
