import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, resolveUploadContentType, validateUploadCandidate } from "@/lib/upload-policy";
import { getUploadDisplayName, getUploadName } from "@/lib/upload-naming";
import { isMissingColumnError } from "@/lib/database-errors";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

export async function POST(request: NextRequest) {
  let stage = "request";
  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll("file");
    if (fileEntries.length > 1) {
      return NextResponse.json({ error: "每次只能上传 1 个文件" }, { status: 400 });
    }
    const file = fileEntries[0];
    const shopId = String(formData.get("shopId") || "");
    const exportType = String(formData.get("exportType") || "");
    const idempotencyKey = String(formData.get("idempotencyKey") || "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "没有收到上传文件" }, { status: 400 });
    }
    if (!shopId || !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "上传参数无效，请刷新页面后重试" }, { status: 400 });
    }

    stage = "validation";
    const supabase = getSupabaseClient();
    const { data: configRows } = await supabase.from("upload_config").select("key, value");
    const policy = configRows ? mergeUploadPolicy(configRows) : DEFAULT_UPLOAD_POLICY;
    const contentType = resolveUploadContentType(file.name, file.type);
    const errors = validateUploadCandidate({
      fileName: file.name,
      fileSize: file.size,
      contentType,
    }, policy);
    if (file.size > policy.largeFileThreshold) errors.push("大文件必须使用分片上传");

    const { data: shop } = await supabase
      .from("shops")
      .select("id, export_type, is_active")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop?.is_active) errors.push("店铺不存在或已停用");
    const exportTypes = String(shop?.export_type || "")
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean);
    if (exportTypes.length > 0 && !exportType) errors.push("请选择文件保存类型");
    if (exportType && exportTypes.length > 0 && !exportTypes.includes(exportType)) {
      errors.push("文件保存类型不属于该店铺");
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("；") }, { status: 400 });
    }

    stage = "idempotency";
    const { data: replay, error: replayError } = await supabase
      .from("uploaded_files")
      .select("stored_key, display_name")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (replayError && !isMissingColumnError(replayError, "idempotency_key")) throw replayError;
    if (replayError) console.warn("数据库缺少 idempotency_key，跳过上传幂等查询");
    if (replay) {
      return NextResponse.json({
        success: true,
        idempotentReplay: true,
        objectKey: replay.stored_key,
        newFileName: replay.display_name || file.name,
      });
    }

    stage = "naming";
    const generatedName = await getUploadName(file.name, shopId, exportType || undefined);
    const displayName = getUploadDisplayName(file.name, generatedName, exportType || undefined);
    const safeShop = shopId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeFileName = generatedName.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
    const requestedKey = `uploads/${safeShop}/${idempotencyKey}_${safeFileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    stage = "storage";
    const objectKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: requestedKey,
      contentType,
    });

    return NextResponse.json({ success: true, objectKey, newFileName: displayName });
  } catch (error) {
    const errorId = randomUUID();
    console.error(`同域上传文件失败 (${stage}) [${errorId}]:`, error);
    const messages: Record<string, string> = {
      request: "上传请求解析失败，请重新选择文件",
      validation: "上传配置校验失败，请刷新页面后重试",
      idempotency: "暂时无法核对上传记录，文件尚未上传。请稍后重试；若持续失败，请将错误编号提供给管理员",
      naming: "文件命名规则处理失败，请检查命名规则配置",
      storage: "对象存储写入失败，请联系管理员检查部署环境",
    };
    const message = messages[stage] || "上传服务暂时不可用，请稍后重试";
    return NextResponse.json({ error: `${message}（错误编号：${errorId}）`, stage, errorId }, { status: 500 });
  }
}
