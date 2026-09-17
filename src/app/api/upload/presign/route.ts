import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import {
  CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, resolveUploadContentType, validateUploadCandidate } from "@/lib/upload-policy";
import { getUploadDisplayName, getUploadName } from "@/lib/upload-naming";
import { createStorageS3Client } from "@/lib/storage-client";

// 创建上传任务。文件内容由同域上传接口转发，避免浏览器跨域请求对象存储。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileSize, shopId, exportType } = body;

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "缺少文件名或文件大小" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const { data: configRows } = await supabase.from("upload_config").select("key, value");
    const policy = configRows ? mergeUploadPolicy(configRows) : DEFAULT_UPLOAD_POLICY;
    const contentType = resolveUploadContentType(fileName, body.contentType || "");
    const validationErrors = validateUploadCandidate({ fileName, fileSize: Number(fileSize), contentType }, policy);
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join("；") }, { status: 400 });
    }

    // 每次上传都使用不可变 key，避免新版本覆盖历史对象。
    const newFileName = await getUploadName(fileName, shopId, exportType);
    const safeShop = String(shopId || "unassigned").replace(/[^a-zA-Z0-9_-]/g, "_");
    const objectKey = `uploads/${safeShop}/${Date.now()}_${crypto.randomUUID()}_${newFileName}`;

    if (Number(fileSize) <= policy.largeFileThreshold) {
      return NextResponse.json({ error: "普通文件请使用同域上传接口" }, { status: 400 });
    }

    const s3Client = createStorageS3Client();
    const displayName = getUploadDisplayName(fileName, newFileName, exportType);

    const createResult = await s3Client.send(new CreateMultipartUploadCommand({
      Bucket: process.env.COZE_BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    }));
    if (!createResult.UploadId) throw new Error("对象存储未返回 multipart uploadId");
    const totalParts = Math.ceil(Number(fileSize) / policy.multipartPartSize);
    if (totalParts > 10_000) {
      return NextResponse.json({ error: "文件分片数量超过对象存储限制" }, { status: 400 });
    }
    const parts = Array.from({ length: totalParts }, (_, index) => ({ partNumber: index + 1 }));
    return NextResponse.json({
      success: true,
      uploadMode: "multipart",
      uploadId: createResult.UploadId,
      objectKey,
      newFileName: displayName,
      partSize: policy.multipartPartSize,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      parts,
    });
  } catch (error) {
    console.error("创建分片上传任务失败:", error);
    return NextResponse.json(
      { error: "创建分片上传任务失败" },
      { status: 500 }
    );
  }
}
