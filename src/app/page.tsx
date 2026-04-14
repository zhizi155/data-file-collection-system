"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, File, X, CheckCircle, AlertCircle, Link, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Shop {
  id: string;
  name: string;
  site: string;
  platform: string;
  is_active: boolean;
}

interface UploadResult {
  success: boolean;
  originalName: string;
  newName: string;
  fileUrl: string;
  fileSize: number;
}

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string>("");
  const [shopLoading, setShopLoading] = useState(true);

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
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFile(e.dataTransfer.files[0]);
      }
    },
    []
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file || !selectedShop) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("shopId", selectedShop);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "上传失败");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const currentShop = shops.find((s) => s.id === selectedShop);

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
              <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
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
                disabled={uploading || !selectedShop || shopLoading} 
                className="w-full" 
                size="lg"
              >
                {uploading ? "上传中..." : "开始上传"}
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
