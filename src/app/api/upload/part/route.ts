import { NextRequest, NextResponse } from "next/server";
import { S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy } from "@/lib/upload-policy";

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
    const chunk = formData.get("chunk");
    const objectKey = String(formData.get("objectKey") || "");
    const uploadId = String(formData.get("uploadId") || "");
    const partNumber = Number(formData.get("partNumber"));
    if (!(chunk instanceof File) || !objectKey.startsWith("uploads/") || !uploadId) {
      return NextResponse.json({ error: "分片上传参数无效" }, { status: 400 });
    }
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      return NextResponse.json({ error: "分片编号无效" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: configRows } = await supabase.from("upload_config").select("key, value");
    const policy = configRows ? mergeUploadPolicy(configRows) : DEFAULT_UPLOAD_POLICY;
    if (chunk.size <= 0 || chunk.size > policy.multipartPartSize) {
      return NextResponse.json({ error: "分片大小无效" }, { status: 400 });
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());
    const result = await createS3Client().send(new UploadPartCommand({
      Bucket: process.env.COZE_BUCKET_NAME,
      Key: objectKey,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer,
      ContentLength: buffer.length,
    }));
    if (!result.ETag) throw new Error("对象存储未返回 ETag");

    return NextResponse.json({ success: true, etag: result.ETag });
  } catch (error) {
    console.error("同域上传分片失败:", error);
    return NextResponse.json({ error: "分片上传失败，请重试" }, { status: 500 });
  }
}
