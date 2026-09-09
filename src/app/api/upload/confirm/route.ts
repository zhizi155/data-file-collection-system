import { NextRequest, NextResponse } from "next/server";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getSessionUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { parseDateFromFilename } from "@/lib/date-parser";
import { getUploadedFilesSchemaMode } from "@/lib/database-capabilities";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

function createS3Client() {
  return new S3Client({
    region: "cn-beijing",
    endpoint: process.env.COZE_BUCKET_ENDPOINT_URL,
    credentials: { accessKeyId: "", secretAccessKey: "" },
  });
}

interface UploadedPart {
  partNumber: number;
  etag: string;
}

interface ConfirmBody {
  objectKey?: string;
  originalName?: string;
  fileSize?: number;
  shopId?: string;
  exportType?: string;
  ruleId?: string;
  displayName?: string;
  checksum?: string;
  mimeType?: string;
  uploadId?: string;
  parts?: UploadedPart[];
  idempotencyKey?: string;
  versionUpgradeConfirmed?: boolean;
}

async function discardUnconfirmedUpload(objectKey: string, uploadId?: string) {
  try {
    if (uploadId) {
      await createS3Client().send(new AbortMultipartUploadCommand({
        Bucket: process.env.COZE_BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
      }));
    } else {
      await storage.deleteFile({ fileKey: objectKey });
    }
  } catch (error) {
    console.warn("清理未确认上传失败:", error);
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const supabase = getSupabaseClient();

  try {
    const body = await request.json() as ConfirmBody;
    const {
      objectKey,
      originalName,
      fileSize,
      shopId,
      exportType,
      ruleId,
      displayName,
      checksum,
      mimeType,
      uploadId,
      parts,
      idempotencyKey,
      versionUpgradeConfirmed,
    } = body;

    if (!objectKey || !originalName || !fileSize || !shopId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const schemaMode = await getUploadedFilesSchemaMode(supabase);

    if (idempotencyKey && schemaMode === "versioned") {
      const { data: replay } = await supabase
        .from("uploaded_files")
        .select("id, original_name, display_name, stored_key, file_size, version")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (replay) {
        const fileUrl = await storage.generatePresignedUrl({ key: replay.stored_key, expireTime: 86400 * 7 });
        return NextResponse.json({
          success: true,
          idempotentReplay: true,
          id: replay.id,
          originalName: replay.original_name,
          newName: replay.display_name,
          fileKey: replay.stored_key,
          fileUrl,
          fileSize: Number(replay.file_size),
          version: replay.version,
        });
      }
    }

    let currentQuery = supabase
      .from("uploaded_files")
      .select("*")
      .eq("shop_id", shopId);
    if (schemaMode === "versioned") {
      currentQuery = currentQuery.eq("is_current", true).eq("is_deleted", false);
    }
    currentQuery = exportType
      ? currentQuery.eq("export_type", exportType)
      : currentQuery.eq("original_name", originalName);
    const { data: currentFile } = await currentQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentFile && versionUpgradeConfirmed !== true) {
      await discardUnconfirmedUpload(objectKey, uploadId);
      return NextResponse.json({
        error: "检测到同店铺同类型文件，请确认创建新版本",
        duplicate: {
          id: currentFile.id,
          version: "version" in currentFile ? currentFile.version || 1 : 1,
        },
      }, { status: 409 });
    }

    const s3Client = createS3Client();
    if (uploadId) {
      const completedParts = (parts ?? [])
        .map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }))
        .filter((part) => part.ETag && Number.isInteger(part.PartNumber) && part.PartNumber > 0)
        .sort((a, b) => a.PartNumber - b.PartNumber);
      if (completedParts.length === 0) {
        return NextResponse.json({ error: "缺少 multipart 分片信息" }, { status: 400 });
      }
      await s3Client.send(new CompleteMultipartUploadCommand({
        Bucket: process.env.COZE_BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: completedParts },
      }));
    }

    const head = await s3Client.send(new HeadObjectCommand({
      Bucket: process.env.COZE_BUCKET_NAME,
      Key: objectKey,
    }));
    if (Number(head.ContentLength) !== Number(fileSize)) {
      await discardUnconfirmedUpload(objectKey);
      return NextResponse.json({ error: "上传后大小校验失败，请重试" }, { status: 422 });
    }

    const extension = originalName.includes(".") ? originalName.split(".").pop() ?? "" : "";
    const finalDisplayName = exportType
      ? `${exportType}${extension ? `.${extension}` : ""}`
      : (displayName || objectKey.split("/").pop() || originalName);
    const parsedPeriod = parseDateFromFilename(originalName);
    const currentVersion = currentFile && "version" in currentFile
      ? Number(currentFile.version) || 1
      : 1;
    const newVersion = schemaMode === "versioned" && currentFile ? currentVersion + 1 : 1;

    if (currentFile && schemaMode === "versioned") {
      const { error: supersedeError } = await supabase
        .from("uploaded_files")
        .update({ is_current: false, superseded_at: new Date().toISOString() })
        .eq("id", currentFile.id)
        .eq("is_current", true);
      if (supersedeError) throw supersedeError;
    }

    const baseInsert = {
      original_name: originalName,
      stored_key: objectKey,
      display_name: finalDisplayName,
      file_size: String(fileSize),
      mime_type: mimeType || "application/octet-stream",
      rule_id: ruleId || null,
      shop_id: shopId,
      export_type: exportType || null,
    };
    const insertPayload = schemaMode === "versioned"
      ? {
        ...baseInsert,
        version: newVersion,
        is_current: true,
        uploaded_by: user?.userId || null,
        checksum: checksum || null,
        idempotency_key: idempotencyKey || null,
        period_start: parsedPeriod?.start || null,
        period_end: parsedPeriod?.end || null,
        period_label: parsedPeriod?.label || null,
        parse_status: parsedPeriod?.status || "pending",
        parse_source: parsedPeriod?.source || "filename",
      }
      : baseInsert;

    const { data: newFile, error: insertError } = await supabase
      .from("uploaded_files")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (currentFile && schemaMode === "versioned") {
        await supabase.from("uploaded_files").update({ is_current: true, superseded_at: null }).eq("id", currentFile.id);
      }
      await discardUnconfirmedUpload(objectKey);
      throw insertError;
    }

    await logAudit(supabase, {
      eventType: "file.upload",
      userId: user?.userId,
      username: user?.username,
      targetType: "file",
      targetId: newFile.id,
      details: { originalName, displayName: finalDisplayName, fileSize, shopId, exportType, version: newVersion },
      result: "success",
    });

    const fileUrl = await storage.generatePresignedUrl({ key: objectKey, expireTime: 86400 * 7 });
    return NextResponse.json({
      success: true,
      id: newFile.id,
      originalName,
      newName: finalDisplayName,
      fileKey: objectKey,
      fileUrl,
      fileSize,
      version: newVersion,
      isVersionUpgrade: Boolean(currentFile),
      period: parsedPeriod ? {
        start: parsedPeriod.start,
        end: parsedPeriod.end,
        label: parsedPeriod.label,
        status: parsedPeriod.status,
      } : null,
    });
  } catch (error) {
    console.error("确认上传失败:", error);
    await logAudit(supabase, {
      eventType: "file.upload",
      userId: user?.userId,
      username: user?.username,
      result: "failure",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "确认上传失败" }, { status: 500 });
  }
}
