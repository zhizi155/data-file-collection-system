import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, validateUploadCandidate } from "@/lib/upload-policy";
import { getUploadDisplayName, getUploadName } from "@/lib/upload-naming";

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
    const file = formData.get("file");
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
    const contentType = file.type || "application/octet-stream";
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
    if (replayError) throw replayError;
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
    console.error(`同域上传文件失败 (${stage}):`, error);
    const messages: Record<string, string> = {
      request: "上传请求解析失败，请重新选择文件",
      validation: "上传配置校验失败，请刷新页面后重试",
      idempotency: "上传记录检查失败，请联系管理员检查数据库结构",
      naming: "文件命名规则处理失败，请检查命名规则配置",
      storage: "对象存储写入失败，请联系管理员检查部署环境",
    };
    return NextResponse.json({ error: messages[stage] || "上传服务暂时不可用，请稍后重试", stage }, { status: 500 });
  }
}
