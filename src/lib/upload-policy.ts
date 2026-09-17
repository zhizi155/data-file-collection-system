export const DEFAULT_UPLOAD_POLICY = {
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "application/zip",
    "application/x-rar-compressed",
    "image/jpeg",
    "image/png",
    "image/gif",
  ],
  maxFileSize: 100 * 1024 * 1024,
  maxBatchSize: 50,
  largeFileThreshold: 12 * 1024 * 1024,
  multipartPartSize: 8 * 1024 * 1024,
};

export interface UploadPolicy {
  allowedMimeTypes: string[];
  maxFileSize: number;
  maxBatchSize: number;
  largeFileThreshold: number;
  multipartPartSize: number;
}

export interface UploadCandidate {
  fileName: string;
  fileSize: number;
  contentType: string;
}

const GENERIC_BINARY_CONTENT_TYPE = "application/octet-stream";

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  "application/x-zip": "application/zip",
  "application/x-zip-compressed": "application/zip",
  "multipart/x-zip": "application/zip",
  "application/vnd.rar": "application/x-rar-compressed",
  "application/x-rar": "application/x-rar-compressed",
};

const ARCHIVE_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  zip: "application/zip",
  rar: "application/x-rar-compressed",
};

function normalizeDeclaredContentType(contentType: string): string {
  const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
  return CONTENT_TYPE_ALIASES[normalized] || normalized || GENERIC_BINARY_CONTENT_TYPE;
}

export function resolveUploadContentType(fileName: string, contentType: string): string {
  const normalized = normalizeDeclaredContentType(contentType);
  if (normalized !== GENERIC_BINARY_CONTENT_TYPE) return normalized;

  const extension = fileName.trim().toLowerCase().match(/\.([^.]+)$/)?.[1] || "";
  return ARCHIVE_CONTENT_TYPE_BY_EXTENSION[extension] || normalized;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function mergeUploadPolicy(entries: Array<{ key: string; value: unknown }>): UploadPolicy {
  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  const mimeValue = values.get("allowed_mime_types");
  const allowedMimeTypes = Array.isArray(mimeValue)
    ? mimeValue.filter((item): item is string => typeof item === "string")
    : DEFAULT_UPLOAD_POLICY.allowedMimeTypes;
  return {
    allowedMimeTypes,
    maxFileSize: positiveNumber(values.get("max_file_size"), DEFAULT_UPLOAD_POLICY.maxFileSize),
    maxBatchSize: positiveNumber(values.get("max_batch_size"), DEFAULT_UPLOAD_POLICY.maxBatchSize),
    largeFileThreshold: positiveNumber(values.get("large_file_threshold"), DEFAULT_UPLOAD_POLICY.largeFileThreshold),
    multipartPartSize: positiveNumber(values.get("multipart_part_size"), DEFAULT_UPLOAD_POLICY.multipartPartSize),
  };
}

export function validateUploadCandidate(candidate: UploadCandidate, policy: UploadPolicy): string[] {
  const errors: string[] = [];
  if (!candidate.fileName.trim()) errors.push("文件名不能为空");
  if (!Number.isFinite(candidate.fileSize) || candidate.fileSize <= 0) errors.push("文件大小无效");
  if (candidate.fileSize > policy.maxFileSize) {
    errors.push(`文件超过 ${policy.maxFileSize} 字节限制`);
  }
  const contentType = resolveUploadContentType(candidate.fileName, candidate.contentType);
  const allowedMimeTypes = new Set(policy.allowedMimeTypes.map(normalizeDeclaredContentType));
  if (!allowedMimeTypes.has(contentType)) {
    errors.push(`不支持的文件类型：${contentType}`);
  }
  return errors;
}
