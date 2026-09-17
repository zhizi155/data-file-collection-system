import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, validateUploadCandidate } from "@/lib/upload-policy";
import { getUploadDisplayName, getUploadName } from "@/lib/upload-naming";

function createS3Client() {
  return new S3Client({
    region: "cn-beijing",
    endpoint: process.env.COZE_BUCKET_ENDPOINT_URL,
    credentials: { accessKeyId: "", secretAccessKey: "" },
  });
}

export async function POST(request: NextRequest) {
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

    const { data: replay } = await supabase
      .from("uploaded_files")
      .select("stored_key, display_name")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (replay) {
      return NextResponse.json({
        success: true,
        idempotentReplay: true,
        objectKey: replay.stored_key,
        newFileName: replay.display_name || file.name,
      });
    }

    const generatedName = await getUploadName(file.name, shopId, exportType || undefined);
    const displayName = getUploadDisplayName(file.name, generatedName, exportType || undefined);
    const safeShop = shopId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeFileName = generatedName.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
    const objectKey = `uploads/${safeShop}/${idempotencyKey}_${safeFileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await createS3Client().send(new PutObjectCommand({
      Bucket: process.env.COZE_BUCKET_NAME,
      Key: objectKey,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: contentType,
    }));

    return NextResponse.json({ success: true, objectKey, newFileName: displayName });
  } catch (error) {
    console.error("同域上传文件失败:", error);
    return NextResponse.json({ error: "上传服务暂时不可用，请稍后重试" }, { status: 500 });
  }
}
