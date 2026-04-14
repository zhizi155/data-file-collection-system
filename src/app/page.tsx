"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Upload, File, X, CheckCircle, AlertCircle, Link, ShoppingBag, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Shop {
  id: string;
  name: string;
  site: string;
  platform: string;
  export_type: string | null;
  is_active: boolean;
}

interface UploadResult {
  success: boolean;
  originalName: string;
  newName: string;
  fileUrl: string;
  fileSize: number;
}

// 大文件阈值（50MB）
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

// 推荐的压缩工具
const COMPRESSION_TIPS = "建议将文件压缩后再上传。可使用 7-Zip、WinRAR 等工具压缩，或使用 ZIP 格式打包。";

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string>("");
  const [selectedExportType, setSelectedExportType] = useState<string>("");
  const [shopLoading, setShopLoading] = useState(true);
  const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null);

  // 加载店铺列表
  const loadShops = useCallback(async () => {
    setShopLoading(true);
    try {
      const res = await fetch("/api/shops?active=true");
      const data = await res.json();
      if (data.success) setShops(data.data);
    } catch (err) {
      console.error("加载店铺失败:", err);
    } finally {
      setShopLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  // 根据选中的店铺获取导出类型选项
  const exportTypeOptions = useMemo(() => {
    if (!selectedShop) return [];
    const shop = shops.find((s) => s.id === selectedShop);
    if (!shop || !shop.export_type) return [];
    // 支持逗号分隔的多个类型
    return shop.export_type.split(",").map((t) => t.trim()).filter(Boolean);
  }, [selectedShop, shops]);

  // 当店铺变化时，清空导出类型选择
  useEffect(() => {
    setSelectedExportType("");
  }, [selectedShop]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      setError(null);
      setResult(null);
      setLargeFileWarning(null);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const selectedFile = e.dataTransfer.files[0];
        setFile(selectedFile);
        
        // 检查文件大小
        if (selectedFile.size > LARGE_FILE_THRESHOLD) {
          setLargeFileWarning(`文件大小为 ${formatFileSize(selectedFile.size)}，超过推荐大小。${COMPRESSION_TIPS}`);
        }
      }
    },
    []
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    setLargeFileWarning(null);
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // 检查文件大小
      if (selectedFile.size > LARGE_FILE_THRESHOLD) {
        setLargeFileWarning(`文件大小为 ${formatFileSize(selectedFile.size)}，超过推荐大小。${COMPRESSION_TIPS}`);
      }
    }
  }, []);

  const handleUpload = async () => {
    if (!file || !selectedShop) return;
    // 如果店铺有导出类型，则必须选择
    if (exportTypeOptions.length > 0 && !selectedExportType) return;

    setUploading(true);
    setError(null);
    setResult(null);
    setUploadProgress(0);

    try {
      const isLargeFile = file.size > LARGE_FILE_THRESHOLD;
      
      if (isLargeFile) {
        // 大文件：使用分片上传
        await uploadLargeFile();
      } else {
        // 普通文件：直接上传
        await uploadNormalFile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // 普通文件上传
  const uploadNormalFile = async () => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("shopId", selectedShop);
    if (selectedExportType) {
      formData.append("exportType", selectedExportType);
    }

    const res = await fetch("/api/upload", { method: "POST", body: formData });

    // 检查Content-Type是否为JSON
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "上传失败");
      } else {
        setResult(data);
      }
    } else {
      // 非JSON响应（可能是代理返回的错误）
      const text = await res.text();
      if (res.status === 413) {
        setError("文件过大，超过了服务器允许的最大限制。建议压缩文件后再上传。");
      } else {
        setError(`上传失败 (${res.status}): ${text.substring(0, 100)}`);
      }
    }
  };

  // 大文件分片上传
  const uploadLargeFile = async () => {
    if (!file) return;
    
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadedChunks = 0;

    // 1. 获取预签名上传URL
    setUploadProgress(5);
    const presignRes = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        shopId: selectedShop,
        exportType: selectedExportType || undefined,
        contentType: file.type || "application/octet-stream",
      }),
    });

    const presignData = await presignRes.json();
    if (!presignRes.ok || !presignData.success) {
      throw new Error(presignData.error || "获取上传链接失败");
    }

    const { objectKey } = presignData;

    // 2. 分片上传文件
    // 注意：这里我们仍然使用 FormData 方式，因为预签名URL是用于直接上传到S3的
    // 如果S3不支持直接PUT，则回退到普通上传
    try {
      // 尝试使用 fetch 直接上传到预签名URL
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append("file", chunk);
        chunkFormData.append("shopId", selectedShop);
        if (selectedExportType) {
          chunkFormData.append("exportType", selectedExportType);
        }
        chunkFormData.append("chunkIndex", i.toString());
        chunkFormData.append("totalChunks", totalChunks.toString());
        chunkFormData.append("objectKey", objectKey);
        chunkFormData.append("fileName", file.name);
        chunkFormData.append("fileSize", file.size.toString());

        const chunkRes = await fetch("/api/upload/chunk", {
          method: "POST",
          body: chunkFormData,
        });

        if (!chunkRes.ok) {
          const chunkData = await chunkRes.json().catch(() => ({}));
          throw new Error(chunkData.error || `分片 ${i + 1} 上传失败`);
        }

        uploadedChunks++;
        const progress = Math.round((uploadedChunks / totalChunks) * 80) + 10;
        setUploadProgress(progress);
      }
    } catch (chunkError) {
      // 如果分片上传失败，回退到普通上传
      console.warn("分片上传失败，尝试普通上传:", chunkError);
      await uploadNormalFile();
      return;
    }

    // 3. 确认上传完成
    setUploadProgress(95);
    const confirmRes = await fetch("/api/upload/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectKey,
        originalName: file.name,
        fileSize: file.size,
        shopId: selectedShop,
        exportType: selectedExportType || undefined,
      }),
    });

    const confirmData = await confirmRes.json();
    if (!confirmRes.ok || !confirmData.success) {
      throw new Error(confirmData.error || "确认上传失败");
    }

    setResult(confirmData);
    setUploadProgress(100);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setSelectedExportType("");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const currentShop = shops.find((s) => s.id === selectedShop);
  const hasExportType = exportTypeOptions.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">文件收集系统</h1>
          <p className="text-slate-600 dark:text-slate-400">拖拽或选择文件进行上传</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              上传文件
            </CardTitle>
            <CardDescription>支持任意格式的文件上传</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 店铺选择 */}
            <div className="space-y-2">
              <Label htmlFor="shop" className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                店铺 <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedShop} onValueChange={setSelectedShop} disabled={shopLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={shopLoading ? "加载中..." : "请选择店铺"} />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((shop) => (
                    <SelectItem key={shop.id} value={shop.id}>
                      {shop.name} ({shop.site} - {shop.platform})
                      {shop.export_type && <span className="ml-2 text-muted-foreground">[{shop.export_type}]</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentShop && (
                <p className="text-xs text-slate-500">
                  已选择店铺: {currentShop.name} | 站点: {currentShop.site} | 平台: {currentShop.platform}
                </p>
              )}
              {shops.length === 0 && !shopLoading && (
                <p className="text-sm text-amber-600">暂无可用店铺，请先在管理后台添加店铺</p>
              )}
            </div>

            {/* 导出类型选择（仅当店铺有设置时显示） */}
            {hasExportType && (
              <div className="space-y-2">
                <Label htmlFor="exportType" className="flex items-center gap-2">
                  <FileType className="w-4 h-4" />
                  文件保存类型 <span className="text-red-500">*</span>
                </Label>
                <Select value={selectedExportType} onValueChange={setSelectedExportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择文件保存类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {exportTypeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  店铺「{currentShop?.name}」的导出类型：{currentShop?.export_type}
                </p>
              </div>
            )}

            {/* 拖拽上传区域 */}
            {!result && (
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                  accept="*/*"
                />
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  拖拽文件到此处，或<span className="text-blue-500">点击选择</span>
                </p>
                <p className="text-xs text-slate-400">支持任意文件类型</p>
              </div>
            )}

            {/* 已选择文件 */}
            {file && !result && (
              <div className="flex flex-col gap-2 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <File className="w-8 h-8 text-slate-500" />
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                      <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleReset} className="text-slate-500 hover:text-slate-700">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                
                {/* 大文件警告 */}
                {largeFileWarning && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">{largeFileWarning}</p>
                    </div>
                  </div>
                )}
                
                {/* 上传进度 */}
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">上传进度</span>
                      <span className="text-slate-600 dark:text-slate-400">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 上传结果 */}
            {result && (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800 dark:text-green-200">上传成功</p>
                    <div className="mt-2 space-y-1 text-sm text-green-700 dark:text-green-300">
                      <p>原始文件名: {result.originalName}</p>
                      <p>保存文件名: {result.newName}</p>
                      <p>文件大小: {formatFileSize(result.fileSize)}</p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => window.open(result.fileUrl, "_blank")} className="gap-2">
                        <Link className="w-4 h-4" />
                        查看文件
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleReset}>上传新文件</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-200">上传失败</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 上传按钮 */}
            {file && (
              <Button 
                onClick={handleUpload} 
                disabled={uploading || !selectedShop || (hasExportType && !selectedExportType) || shopLoading} 
                className="w-full" 
                size="lg"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    上传中 {uploadProgress}%
                  </span>
                ) : file.size > LARGE_FILE_THRESHOLD ? (
                  <span className="flex items-center gap-2">
                    <span>⚠️</span>
                    上传大文件（可能需要较长时间）
                  </span>
                ) : (
                  "开始上传"
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* 底部链接 */}
        <div className="mt-8 text-center">
          <a href="/admin/login" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
            管理后台
          </a>
        </div>
      </div>
    </div>
  );
}
