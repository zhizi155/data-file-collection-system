"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  FileType,
  PauseCircle,
  RefreshCw,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, SearchSelectItem } from "@/components/ui/search-select";
import type { UploadPolicy } from "@/lib/upload-policy";

interface Shop {
  id: string;
  name: string;
  site: string;
  platform: string;
  export_type: string | null;
  manager: string | null;
}

interface DuplicateInfo {
  id: string;
  name: string;
  version: number;
  createdAt: string;
}

interface UploadResult {
  id: string;
  originalName: string;
  newName: string;
  fileUrl: string;
  fileSize: number;
  version: number;
}

type UploadStatus = "ready" | "checking" | "duplicate" | "uploading" | "confirming" | "success" | "error" | "cancelled";

interface UploadItem {
  id: string;
  idempotencyKey: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  duplicate?: DuplicateInfo;
  result?: UploadResult;
}

interface PresignedPart {
  partNumber: number;
  uploadUrl: string;
}

interface PresignResponse {
  success: boolean;
  uploadMode: "single" | "multipart";
  uploadUrl?: string;
  uploadId?: string;
  objectKey: string;
  newFileName: string;
  partSize?: number;
  expiresAt: string;
  parts?: PresignedPart[];
  error?: string;
}

interface ResumeState {
  presign: PresignResponse;
  completedParts: Array<{ partNumber: number; etag: string }>;
}

const DEFAULT_POLICY: UploadPolicy = {
  allowedMimeTypes: [],
  maxFileSize: 100 * 1024 * 1024,
  maxBatchSize: 50,
  largeFileThreshold: 12 * 1024 * 1024,
  multipartPartSize: 8 * 1024 * 1024,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(status: UploadStatus): string {
  return {
    ready: "等待上传",
    checking: "正在预检",
    duplicate: "等待确认新版本",
    uploading: "正在上传",
    confirming: "正在校验并登记",
    success: "上传成功",
    error: "上传失败",
    cancelled: "已取消",
  }[status];
}

function requestWithProgress(
  url: string,
  data: Blob,
  contentType: string,
  onProgress: (loaded: number, total: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || data.size);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag") || "");
      } else {
        reject(new Error(`对象存储返回 ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("网络连接中断"));
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
    xhr.send(data);
  });
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (attempt < attempts) await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export default function UploadPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [selectedExportType, setSelectedExportType] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [policy, setPolicy] = useState<UploadPolicy>(DEFAULT_POLICY);
  const [dragActive, setDragActive] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const activeRequests = useRef(new Map<string, Set<XMLHttpRequest>>());

  useEffect(() => {
    Promise.all([
      fetch("/api/shops?active=true").then((response) => response.json()),
      fetch("/api/upload/config").then((response) => response.json()),
    ]).then(([shopData, configData]) => {
      if (shopData.success) setShops(shopData.data);
      if (configData.success) setPolicy(configData.data);
    }).catch(() => setPageError("加载上传配置失败，请刷新页面重试"));
  }, []);

  const currentShop = shops.find((shop) => shop.id === selectedShop);
  const exportTypes = useMemo(() => String(currentShop?.export_type || "")
    .split(",").map((item) => item.trim()).filter(Boolean), [currentShop]);

  useEffect(() => setSelectedExportType(""), [selectedShop]);

  const updateItem = useCallback((id: string, update: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setPageError(null);
    setItems((current) => {
      const remaining = Math.max(0, policy.maxBatchSize - current.length);
      const accepted = files.slice(0, remaining);
      if (accepted.length < files.length) {
        window.setTimeout(() => setPageError(`单批最多 ${policy.maxBatchSize} 个文件`), 0);
      }
      return [...current, ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        file,
        status: "ready" as const,
        progress: 0,
      }))];
    });
  }, [policy.maxBatchSize]);

  const resumeKey = (item: UploadItem) => [
    "finance-upload-v2",
    selectedShop,
    selectedExportType,
    item.file.name,
    item.file.size,
    item.file.lastModified,
  ].join(":");

  const registerRequest = (itemId: string, xhr: XMLHttpRequest) => {
    const requests = activeRequests.current.get(itemId) ?? new Set<XMLHttpRequest>();
    requests.add(xhr);
    activeRequests.current.set(itemId, requests);
  };

  const cancelUpload = (itemId: string) => {
    activeRequests.current.get(itemId)?.forEach((xhr) => xhr.abort());
    activeRequests.current.delete(itemId);
    updateItem(itemId, { status: "cancelled", error: undefined });
  };

  const uploadSingle = async (item: UploadItem, presign: PresignResponse) => {
    if (!presign.uploadUrl) throw new Error("服务器未返回上传地址");
    await withRetry(() => requestWithProgress(
      presign.uploadUrl!,
      item.file,
      item.file.type || "application/octet-stream",
      (loaded, total) => updateItem(item.id, { progress: Math.round(5 + (loaded / total) * 85) }),
      (xhr) => registerRequest(item.id, xhr),
    ));
    return [] as Array<{ partNumber: number; etag: string }>;
  };

  const uploadMultipart = async (item: UploadItem, presign: PresignResponse, restored: ResumeState | null) => {
    if (!presign.parts || !presign.partSize) throw new Error("服务器未返回分片信息");
    const completed = new Map((restored?.completedParts ?? []).map((part) => [part.partNumber, part.etag]));
    const loadedByPart = new Map<number, number>();
    const pending = presign.parts.filter((part) => !completed.has(part.partNumber));
    let cursor = 0;

    const publishProgress = () => {
      const completedBytes = [...completed.keys()].reduce((sum, partNumber) => {
        const start = (partNumber - 1) * presign.partSize!;
        return sum + Math.min(presign.partSize!, item.file.size - start);
      }, 0);
      const activeBytes = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
      updateItem(item.id, { progress: Math.min(90, Math.round(5 + ((completedBytes + activeBytes) / item.file.size) * 85)) });
    };

    const worker = async () => {
      while (cursor < pending.length) {
        const part = pending[cursor++];
        const start = (part.partNumber - 1) * presign.partSize!;
        const blob = item.file.slice(start, Math.min(start + presign.partSize!, item.file.size));
        const etag = await withRetry(() => requestWithProgress(
          part.uploadUrl,
          blob,
          "",
          (loaded) => { loadedByPart.set(part.partNumber, loaded); publishProgress(); },
          (xhr) => registerRequest(item.id, xhr),
        ));
        if (!etag) throw new Error("对象存储未暴露 ETag，请检查存储 CORS 配置");
        loadedByPart.delete(part.partNumber);
        completed.set(part.partNumber, etag);
        localStorage.setItem(resumeKey(item), JSON.stringify({
          presign,
          completedParts: [...completed].map(([partNumber, value]) => ({ partNumber, etag: value })),
        } satisfies ResumeState));
        publishProgress();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length || 1) }, worker));
    return [...completed].map(([partNumber, etag]) => ({ partNumber, etag }));
  };

  const checksumFor = async (file: File): Promise<string | undefined> => {
    if (file.size > 32 * 1024 * 1024) return undefined;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const startUpload = async (item: UploadItem, versionUpgradeConfirmed = false) => {
    if (!selectedShop || (exportTypes.length > 0 && !selectedExportType)) {
      setPageError("请先选择店铺和文件保存类型");
      return;
    }
    updateItem(item.id, { status: "checking", progress: 1, error: undefined });
    try {
      const preflightResponse = await fetch("/api/upload/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: item.file.name,
          fileSize: item.file.size,
          contentType: item.file.type || "application/octet-stream",
          shopId: selectedShop,
          exportType: selectedExportType || undefined,
        }),
      });
      const preflight = await preflightResponse.json();
      if (!preflightResponse.ok || !preflight.success) {
        throw new Error(preflight.errors?.join("；") || preflight.error || "上传预检失败");
      }
      if (preflight.duplicate && !versionUpgradeConfirmed) {
        updateItem(item.id, { status: "duplicate", progress: 0, duplicate: preflight.duplicate });
        return;
      }

      let restored: ResumeState | null = null;
      const saved = localStorage.getItem(resumeKey(item));
      if (saved) {
        try {
          const candidate = JSON.parse(saved) as ResumeState;
          if (new Date(candidate.presign.expiresAt).getTime() > Date.now() + 60_000) restored = candidate;
        } catch { localStorage.removeItem(resumeKey(item)); }
      }

      let presign: PresignResponse;
      if (restored) {
        presign = restored.presign;
      } else {
        presign = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: item.file.name,
            fileSize: item.file.size,
            contentType: item.file.type || "application/octet-stream",
            shopId: selectedShop,
            exportType: selectedExportType || undefined,
          }),
        }).then((response) => response.json() as Promise<PresignResponse>);
      }
      if (!presign.success) throw new Error(presign.error || "获取上传地址失败");

      updateItem(item.id, { status: "uploading", progress: 5 });
      const parts = presign.uploadMode === "multipart"
        ? await uploadMultipart(item, presign, restored)
        : await uploadSingle(item, presign);
      updateItem(item.id, { status: "confirming", progress: 94 });

      const confirmResponse = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: presign.objectKey,
          uploadId: presign.uploadId,
          parts,
          originalName: item.file.name,
          displayName: presign.newFileName,
          fileSize: item.file.size,
          mimeType: item.file.type || "application/octet-stream",
          shopId: selectedShop,
          exportType: selectedExportType || undefined,
          checksum: await checksumFor(item.file),
          idempotencyKey: item.idempotencyKey,
          versionUpgradeConfirmed,
        }),
      });
      const result = await confirmResponse.json();
      if (!confirmResponse.ok || !result.success) throw new Error(result.error || "上传确认失败");
      localStorage.removeItem(resumeKey(item));
      activeRequests.current.delete(item.id);
      updateItem(item.id, { status: "success", progress: 100, duplicate: undefined, result });
    } catch (error) {
      activeRequests.current.delete(item.id);
      if (error instanceof DOMException && error.name === "AbortError") {
        updateItem(item.id, { status: "cancelled", error: undefined });
      } else {
        updateItem(item.id, { status: "error", error: error instanceof Error ? error.message : "上传失败" });
      }
    }
  };

  const startAll = async () => {
    const pending = items.filter((item) => ["ready", "error", "cancelled"].includes(item.status));
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) await startUpload(pending[cursor++]);
    };
    await Promise.all(Array.from({ length: Math.min(2, pending.length || 1) }, worker));
  };

  const busy = items.some((item) => ["checking", "uploading", "confirming"].includes(item.status));

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">财务文件收集系统</h1>
          <p className="mt-2 text-slate-600">批量上传、断点续传和文件版本管理</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="size-5" />上传文件</CardTitle>
            <CardDescription>
              单文件最大 {formatFileSize(policy.maxFileSize)}，单批最多 {policy.maxBatchSize} 个；
              超过 {formatFileSize(policy.largeFileThreshold)} 自动使用对象存储多段直传。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {pageError && <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{pageError}</div>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><ShoppingBag className="size-4" />店铺</Label>
                <SearchSelect value={selectedShop} onValueChange={(value) => setSelectedShop(Array.isArray(value) ? value[0] || "" : value)} placeholder="请选择店铺" disabled={busy}>
                  {shops.map((shop) => <SearchSelectItem key={shop.id} value={shop.id}>{shop.name}</SearchSelectItem>)}
                </SearchSelect>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><FileType className="size-4" />文件保存类型</Label>
                <Select value={selectedExportType} onValueChange={setSelectedExportType} disabled={!selectedShop || exportTypes.length === 0 || busy}>
                  <SelectTrigger aria-label="文件保存类型"><SelectValue placeholder={exportTypes.length ? "请选择类型" : "该店铺无需选择"} /></SelectTrigger>
                  <SelectContent>{exportTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div
              className={`relative rounded-lg border-2 border-dashed p-7 text-center transition ${dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"}`}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles([...event.dataTransfer.files]); }}
            >
              <input
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                type="file"
                multiple
                aria-label="选择要上传的财务文件"
                disabled={busy || items.length >= policy.maxBatchSize}
                onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }}
              />
              <Upload className="mx-auto size-10 text-slate-400" />
              <p className="mt-3 font-medium text-slate-700">拖拽文件到这里，或点击选择多个文件</p>
              <p className="mt-1 text-xs text-slate-500">上传前会校验大小、类型、店铺配置和重复版本</p>
            </div>

            <div className="space-y-3" aria-live="polite">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-start gap-3">
                    <FileIcon className="mt-1 size-6 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="truncate font-medium" title={item.file.name}>{item.file.name}</p><p className="text-xs text-slate-500">{formatFileSize(item.file.size)} · {statusLabel(item.status)}</p></div>
                        <div className="flex shrink-0 gap-1">
                          {["uploading", "checking", "confirming"].includes(item.status) && <Button variant="ghost" size="icon" aria-label={`取消 ${item.file.name}`} onClick={() => cancelUpload(item.id)}><PauseCircle className="size-4" /></Button>}
                          {["ready", "error", "cancelled"].includes(item.status) && <Button variant="ghost" size="icon" aria-label={`重试 ${item.file.name}`} onClick={() => startUpload(item)}><RefreshCw className="size-4" /></Button>}
                          {!busy && item.status !== "success" && <Button variant="ghost" size="icon" aria-label={`移除 ${item.file.name}`} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}><X className="size-4" /></Button>}
                        </div>
                      </div>
                      {item.progress > 0 && <Progress className="mt-3 h-2" value={item.progress} aria-label={`${item.file.name} 上传进度 ${item.progress}%`} />}
                      {item.error && <p role="alert" className="mt-2 text-sm text-red-600">{item.error}</p>}
                      {item.duplicate && <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 md:flex-row md:items-center md:justify-between"><span>已有“{item.duplicate.name}”v{item.duplicate.version}，是否保存为新版本？</span><Button size="sm" onClick={() => startUpload(item, true)}>确认创建 v{item.duplicate.version + 1}</Button></div>}
                      {item.result && <div className="mt-3 flex items-center justify-between rounded-md bg-green-50 p-3 text-sm text-green-800"><span className="flex items-center gap-2"><CheckCircle2 className="size-4" />已保存为 {item.result.newName}（v{item.result.version}）</span><a className="font-medium underline" href={item.result.fileUrl} target="_blank" rel="noreferrer">查看</a></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && <div className="flex flex-col gap-2 sm:flex-row"><Button className="flex-1" size="lg" disabled={busy || !selectedShop || (exportTypes.length > 0 && !selectedExportType)} onClick={startAll}>{busy ? "上传处理中…" : "开始上传队列"}</Button><Button variant="outline" disabled={busy} onClick={() => setItems([])}>清空队列</Button></div>}
          </CardContent>
        </Card>

        <div className="text-center"><Link className="text-sm text-slate-500 hover:text-slate-800" href="/admin/login">进入管理后台</Link></div>
      </div>
    </main>
  );
}
