import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadedFilesSchemaMode = "legacy" | "versioned";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

const FILE_VERSIONING_COLUMNS = [
  "version",
  "is_current",
  "is_deleted",
  "period_start",
  "period_end",
  "period_label",
  "parse_status",
].join(",");

let uploadedFilesSchemaModePromise: Promise<UploadedFilesSchemaMode> | null = null;
let exportJobsSupportPromise: Promise<boolean> | null = null;

export function isMissingDatabaseFeatureError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as DatabaseErrorLike;
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(databaseError.code ?? "")) {
    return true;
  }

  const message = databaseError.message?.toLowerCase() ?? "";
  return message.includes("does not exist")
    || message.includes("could not find the")
    || message.includes("schema cache");
}

async function detectUploadedFilesSchemaMode(
  supabase: SupabaseClient,
): Promise<UploadedFilesSchemaMode> {
  const { error } = await supabase
    .from("uploaded_files")
    .select(FILE_VERSIONING_COLUMNS)
    .limit(1);

  if (!error) return "versioned";
  if (isMissingDatabaseFeatureError(error)) {
    console.warn("uploaded_files 使用旧版表结构，已启用兼容模式:", error.message);
    return "legacy";
  }
  throw error;
}

export function getUploadedFilesSchemaMode(
  supabase: SupabaseClient,
): Promise<UploadedFilesSchemaMode> {
  uploadedFilesSchemaModePromise ??= detectUploadedFilesSchemaMode(supabase).catch((error) => {
    uploadedFilesSchemaModePromise = null;
    throw error;
  });
  return uploadedFilesSchemaModePromise;
}

async function detectExportJobsSupport(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("export_jobs").select("id").limit(1);
  if (!error) return true;
  if (isMissingDatabaseFeatureError(error)) return false;
  throw error;
}

export function supportsExportJobs(supabase: SupabaseClient): Promise<boolean> {
  exportJobsSupportPromise ??= detectExportJobsSupport(supabase).catch((error) => {
    exportJobsSupportPromise = null;
    throw error;
  });
  return exportJobsSupportPromise;
}

export function normalizeUploadedFileForSchema<T extends Record<string, unknown>>(
  row: T,
  mode: UploadedFilesSchemaMode,
): T & {
  version: number;
  is_current: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  parse_status: string | null;
} {
  if (mode === "versioned") {
    return {
      ...row,
      version: Number(row.version) || 1,
      is_current: row.is_current !== false,
      is_deleted: row.is_deleted === true,
      deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
      period_start: typeof row.period_start === "string" ? row.period_start : null,
      period_end: typeof row.period_end === "string" ? row.period_end : null,
      period_label: typeof row.period_label === "string" ? row.period_label : null,
      parse_status: typeof row.parse_status === "string" ? row.parse_status : null,
    };
  }

  return {
    ...row,
    version: 1,
    is_current: true,
    is_deleted: false,
    deleted_at: null,
    period_start: null,
    period_end: null,
    period_label: null,
    parse_status: null,
  };
}

export function resetDatabaseCapabilityCacheForTests(): void {
  uploadedFilesSchemaModePromise = null;
  exportJobsSupportPromise = null;
}
