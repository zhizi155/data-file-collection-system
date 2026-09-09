import { after, NextRequest, NextResponse } from "next/server";
import { PassThrough } from "stream";
import archiver from "archiver";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { createUniqueArchivePath, sanitizeArchiveSegment } from "@/lib/query-builder";
import { supportsExportJobs } from "@/lib/database-capabilities";

interface ExportFile {
  id: string;
  original_name: string;
  display_name: string | null;
  stored_key: string;
  shop_id: string | null;
  export_type: string | null;
  version: number | null;
  file_size: string;
}

interface ExportShop {
  id: string;
  name: string;
  site: string;
  platform: string;
}

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "files:export");
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as { fileIds?: string[]; includeHistory?: boolean };
    const fileIds = [...new Set((body.fileIds ?? []).filter(Boolean))];
    if (fileIds.length === 0) return NextResponse.json({ error: "请选择要导出的文件" }, { status: 400 });
    if (fileIds.length > 5000) return NextResponse.json({ error: "单个导出任务最多 5000 个文件" }, { status: 400 });

    const supabase = getSupabaseClient();
    if (!await supportsExportJobs(supabase)) {
      return NextResponse.json({
        error: "当前数据库尚未启用后台导出任务，已切换为兼容下载。",
        fallbackEndpoint: "/api/files/batch-download",
      }, { status: 409 });
    }
    const { data: job, error } = await supabase.from("export_jobs").insert({
      user_id: auth.session!.userId,
      status: "pending",
      file_count: fileIds.length,
      file_ids: fileIds,
      filter_params: { includeHistory: Boolean(body.includeHistory) },
    }).select().single();
    if (error || !job) return NextResponse.json({ error: `创建导出任务失败: ${error?.message || "未知错误"}` }, { status: 500 });

    await logAudit(supabase, {
      eventType: "file.export",
      userId: auth.session!.userId,
      username: auth.session!.username,
      targetType: "export_job",
      targetId: job.id,
      details: { fileCount: fileIds.length, includeHistory: Boolean(body.includeHistory) },
      result: "success",
    });
    after(() => processExportJob(job.id));
    return NextResponse.json({ success: true, jobId: job.id, status: "pending" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建导出任务失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:export");
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const limit = boundedInteger(searchParams.get("limit"), 20, 1, 100);
  const offset = boundedInteger(searchParams.get("offset"), 0, 0, 10_000);
  const jobId = searchParams.get("jobId");
  const supabase = getSupabaseClient();
  if (!await supportsExportJobs(supabase)) {
    return NextResponse.json({ success: true, data: [], backgroundJobs: false });
  }

  let query = supabase
    .from("export_jobs")
    .select("*")
    .eq("user_id", auth.session!.userId)
    .order("created_at", { ascending: false });
  if (jobId) query = query.eq("id", jobId);
  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: "获取导出任务失败" }, { status: 500 });

  const jobs = data ?? [];
  await Promise.all(jobs.map(async (job) => {
    if (job.status === "pending") after(() => processExportJob(job.id));
    if (job.status === "completed" && job.result_key && (!job.result_expires_at || new Date(job.result_expires_at).getTime() < Date.now() + 60_000)) {
      const resultUrl = await storage.generatePresignedUrl({ key: job.result_key, expireTime: 86400 });
      job.result_url = resultUrl;
      job.result_expires_at = new Date(Date.now() + 86400_000).toISOString();
      await supabase.from("export_jobs").update({ result_url: resultUrl, result_expires_at: job.result_expires_at }).eq("id", job.id);
    }
  }));
  return NextResponse.json({ success: true, data: jobs });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, "files:export");
  if (auth.error) return auth.error;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "缺少任务ID" }, { status: 400 });
  const supabase = getSupabaseClient();
  if (!await supportsExportJobs(supabase)) {
    return NextResponse.json({ error: "当前数据库尚未启用后台导出任务" }, { status: 409 });
  }
  const { error } = await supabase
    .from("export_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("user_id", auth.session!.userId)
    .in("status", ["pending", "processing"]);
  if (error) return NextResponse.json({ error: "取消失败" }, { status: 500 });
  return NextResponse.json({ success: true });
}

async function processExportJob(jobId: string) {
  const supabase = getSupabaseClient();
  const { data: claimed } = await supabase
    .from("export_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return;

  try {
    const fileIds = (claimed.file_ids ?? []) as string[];
    const files: ExportFile[] = [];
    for (let index = 0; index < fileIds.length; index += 100) {
      const { data, error } = await supabase
        .from("uploaded_files")
        .select("id, original_name, display_name, stored_key, shop_id, export_type, version, file_size")
        .in("id", fileIds.slice(index, index + 100));
      if (error) throw error;
      files.push(...(data ?? []) as ExportFile[]);
    }
    if (files.length === 0) throw new Error("没有可导出的文件");

    const shopIds = [...new Set(files.map((file) => file.shop_id).filter((id): id is string => Boolean(id)))];
    const { data: shopData } = shopIds.length > 0
      ? await supabase.from("shops").select("id, name, site, platform").in("id", shopIds)
      : { data: [] };
    const shops = new Map(((shopData ?? []) as ExportShop[]).map((shop) => [shop.id, shop]));
    const archive = archiver("zip", { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);
    const requestedKey = `exports/${jobId}_${Date.now()}.zip`;
    const uploadPromise = storage.streamUploadFile({ stream: passThrough, fileName: requestedKey, contentType: "application/zip" });
    const usedPaths = new Set<string>();
    const manifest: Array<Record<string, unknown>> = [];
    let processed = 0;
    let failed = 0;

    for (const file of files) {
      if ((processed + failed) % 10 === 0) {
        const { data: statusRow } = await supabase.from("export_jobs").select("status").eq("id", jobId).single();
        if (statusRow?.status === "cancelled") throw new Error("任务已取消");
      }
      const shop = file.shop_id ? shops.get(file.shop_id) : undefined;
      const baseName = file.display_name || file.original_name;
      const versionSuffix = (file.version ?? 1) > 1
        ? baseName.replace(/(\.[^.]*)?$/, `_v${file.version}$1`)
        : baseName;
      const archivePath = createUniqueArchivePath([
        sanitizeArchiveSegment(shop?.site || "未分类站点"),
        sanitizeArchiveSegment(shop?.platform || "未分类平台"),
        sanitizeArchiveSegment(shop?.name || "未关联店铺"),
        sanitizeArchiveSegment(versionSuffix),
      ].join("/"), usedPaths);
      try {
        const content = await storage.readFile({ fileKey: file.stored_key });
        archive.append(content, { name: archivePath });
        processed += 1;
        manifest.push({ id: file.id, archivePath, originalName: file.original_name, version: file.version || 1, status: "included" });
      } catch (error) {
        failed += 1;
        manifest.push({ id: file.id, archivePath, originalName: file.original_name, status: "failed", error: error instanceof Error ? error.message : "读取失败" });
      }
      if ((processed + failed) % 5 === 0) {
        await supabase.from("export_jobs").update({ processed_count: processed, failed_count: failed }).eq("id", jobId);
      }
    }

    archive.append(JSON.stringify({ jobId, generatedAt: new Date().toISOString(), requested: files.length, processed, failed, files: manifest }, null, 2), { name: "manifest.json" });
    await archive.finalize();
    const resultKey = await uploadPromise;
    const resultUrl = await storage.generatePresignedUrl({ key: resultKey, expireTime: 86400 });
    await supabase.from("export_jobs").update({
      status: "completed",
      file_count: files.length,
      processed_count: processed,
      failed_count: failed,
      result_key: resultKey,
      result_url: resultUrl,
      result_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message !== "任务已取消") {
      await supabase.from("export_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", jobId);
    }
  }
}
