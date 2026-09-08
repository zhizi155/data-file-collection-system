"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Edit2,
  Trash2,
  Settings,
  LogOut,
  X,
  AlertCircle,
  FileText,
  Upload,
  ShoppingBag,
  Variable,
  File,
  Download,
  FolderDown,
  Link as LinkIcon,
  CheckSquare,
  Square,
  Loader2,
  ArchiveRestore,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SearchSelect, SearchSelectItem } from "@/components/ui/search-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";

interface NamingRule {
  id: string;
  name: string;
  pattern: string;
  description: string | null;
  is_active: boolean;
  export_type: string | null; // 关联的导出类型，null表示通用规则
  created_at: string;
  updated_at: string | null;
}

interface Shop {
  id: string;
  name: string;
  site: string;
  platform: string;
  description: string | null;
  export_type: string | null;
  manager: string | null;
  is_active: boolean;
  created_at: string;
}

interface CustomVariable {
  id: string;
  name: string;
  value: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

interface UploadedFile {
  id: string;
  original_name: string;
  stored_key: string;
  display_name: string | null; // 命名规则生成的文件名（不含路径）
  file_size: string;
  mime_type: string | null;
  rule_id: string | null;
  shop_id: string | null;
  export_type: string | null; // 文件保存类型
  created_at: string;
  date_range: string | null; // 智能识别的日期区间
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  parse_status: string | null;
  version: number;
  is_current: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  shops?: {
    name: string;
    site: string;
    platform: string;
  } | null;
}

interface AdminAccount {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  login_count: number;
  created_at: string;
}

interface ExportJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  file_count: number;
  processed_count: number;
  failed_count: number;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [variables, setVariables] = useState<CustomVariable[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("files");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [fileFilterShop, setFileFilterShop] = useState<string[]>([]);
  const [fileFilterPlatform, setFileFilterPlatform] = useState<string[]>([]);
  const [fileFilterSite, setFileFilterSite] = useState<string[]>([]);
  const [fileFilterDateRange, setFileFilterDateRange] = useState<string[]>([]);
  const [fileFilterDisplayName, setFileFilterDisplayName] = useState<string[]>([]);
  const [fileDisplayNameSearch, setFileDisplayNameSearch] = useState("");
  const [debouncedDisplayNameSearch, setDebouncedDisplayNameSearch] = useState("");
  const [fileView, setFileView] = useState<"current" | "history" | "trash">("current");
  const [fileFilterExportType, setFileFilterExportType] = useState<string[]>([]);
  
  // 联动筛选的可选项（基于其他筛选条件过滤后的数据）
  const [availableDateRanges, setAvailableDateRanges] = useState<string[]>([]); // 所有可用的日期区间
  const [availableDisplayNames, setAvailableDisplayNames] = useState<string[]>([]); // 所有可用的保存文件名
  const [availableShops, setAvailableShops] = useState<Shop[]>([]); // 基于联动的可用店铺
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]); // 基于联动的可用平台
  const [availableSites, setAvailableSites] = useState<string[]>([]); // 基于联动的可用站点
  const [availableFileExportTypes, setAvailableFileExportTypes] = useState<string[]>([]);
  
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [exportModalOpen, setExportModalOpen] = useState(false); // 导出方式选择弹窗
  const [downloadModalOpen, setDownloadModalOpen] = useState(false); // 下载方式选择弹窗
  const [pageRangeModalOpen, setPageRangeModalOpen] = useState(false); // 页数范围下载弹窗
  const [downloadStartPage, setDownloadStartPage] = useState(1);
  const [downloadEndPage, setDownloadEndPage] = useState(1);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);

  // 登录检查
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // 规则模态框状态
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NamingRule | null>(null);
  const [ruleForm, setRuleForm] = useState({ name: "", pattern: "", description: "", export_type: "" });
  const [ruleSaving, setRuleSaving] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [ruleDeleting, setRuleDeleting] = useState(false);
  const [availableExportTypes, setAvailableExportTypes] = useState<string[]>([]); // 可用的导出类型列表

  // 店铺模态框状态
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [shopForm, setShopForm] = useState({ name: "", site: "", platform: "", description: "", export_type: "", manager: "" });
  const [shopSaving, setShopSaving] = useState(false);
  const [deleteShopId, setDeleteShopId] = useState<string | null>(null);
  const [shopDeleting, setShopDeleting] = useState(false);
  const [importingShops, setImportingShops] = useState(false);
  const [shopPreview, setShopPreview] = useState<{ site: string; platform: string; name: string; export_type?: string; manager?: string }[]>([]);
  const [shopFilterSite, setShopFilterSite] = useState<string[]>([]); // 店铺列表站点筛选
  const [selectedShops, setSelectedShops] = useState<Set<string>>(new Set()); // 批量选择的店铺
  const [batchDeleteShopOpen, setBatchDeleteShopOpen] = useState(false);
  const [shopBatchDeleting, setShopBatchDeleting] = useState(false);

  // 变量模态框状态
  const [varModalOpen, setVarModalOpen] = useState(false);
  const [editingVar, setEditingVar] = useState<CustomVariable | null>(null);
  const [varForm, setVarForm] = useState({ name: "", value: "", description: "" });
  const [varSaving, setVarSaving] = useState(false);
  const [deleteVarId, setDeleteVarId] = useState<string | null>(null);
  const [varDeleting, setVarDeleting] = useState(false);

  // 账号管理状态
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);
  const [accountForm, setAccountForm] = useState({ username: "", password: "", display_name: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [accountDeleting, setAccountDeleting] = useState(false);

  const isMainAccount = user?.role === "main";
  const isSubAccount = user?.role === "sub";

  // 加载所有数据
  const loadData = useCallback(async () => {
    try {
      const [rulesRes, shopsRes, varsRes] = await Promise.all([
        fetch("/api/rules"),
        fetch("/api/shops"),
        fetch("/api/variables"),
      ]);
      const [rulesData, shopsData, varsData] = await Promise.all([
        rulesRes.json(),
        shopsRes.json(),
        varsRes.json(),
      ]);

      if (rulesData.success) setRules(rulesData.data);
      if (shopsData.success) {
        setShops(shopsData.data);
        // 提取所有不重复的导出类型
        const exportTypes = [...new Set(
          shopsData.data
            .map((s: Shop) => s.export_type)
            .filter((t: string | null) => t)
        )] as string[];
        setAvailableExportTypes(exportTypes);
      }
      if (varsData.success) setVariables(varsData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载账号列表
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/admin-users");
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
      }
    } catch (err) {
      console.error("加载账号失败:", err);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (isMainAccount && activeTab === "accounts") {
      loadAccounts();
    }
  }, [activeTab, isMainAccount, loadAccounts]);

  // 账号相关操作
  const openAccountModal = (account?: AdminAccount) => {
    if (account) {
      setEditingAccount(account);
      setAccountForm({
        username: account.username,
        password: "",
        display_name: account.display_name || "",
      });
    } else {
      setEditingAccount(null);
      setAccountForm({ username: "", password: "", display_name: "" });
    }
    setAccountModalOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!accountForm.username) {
      setError("用户名不能为空");
      return;
    }
    if (!editingAccount && !accountForm.password) {
      setError("密码不能为空");
      return;
    }

    setAccountSaving(true);
    try {
      const url = "/api/admin-users";
      const method = editingAccount ? "PUT" : "POST";
      const body = editingAccount
        ? { id: editingAccount.id, display_name: accountForm.display_name, password: accountForm.password || undefined }
        : { username: accountForm.username, password: accountForm.password, display_name: accountForm.display_name, role: "sub" };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        setAccountModalOpen(false);
        loadAccounts();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setAccountSaving(false);
    }
  };

  const handleToggleAccount = async (account: AdminAccount) => {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, is_active: !account.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        loadAccounts();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountId) return;
    setAccountDeleting(true);
    try {
      const res = await fetch(`/api/admin-users?id=${deleteAccountId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDeleteAccountId(null);
        loadAccounts();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setAccountDeleting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDisplayNameSearch(fileDisplayNameSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [fileDisplayNameSearch]);

  // 加载文件记录
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
          shopIds: fileFilterShop,
          platforms: fileFilterPlatform,
          sites: fileFilterSite,
          periodLabels: fileFilterDateRange,
          displayNames: fileFilterDisplayName,
          displayNameContains: debouncedDisplayNameSearch,
          exportTypes: fileFilterExportType,
          view: fileView,
          includeOptions: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "加载失败");
      if (data.success) {
        setFiles(data.data);
        setTotalCount(data.total || 0);
        const optionShopIds = new Set<string>((data.options?.shops ?? []).map((shop: { id: string }) => shop.id));
        setAvailableShops(shops.filter((shop) => optionShopIds.has(shop.id)));
        setAvailablePlatforms(data.options?.platforms ?? []);
        setAvailableSites(data.options?.sites ?? []);
        setAvailableDateRanges(data.options?.periodLabels ?? []);
        setAvailableDisplayNames(data.options?.displayNames ?? []);
        setAvailableFileExportTypes(data.options?.exportTypes ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setFilesLoading(false);
    }
  }, [fileFilterShop, fileFilterPlatform, fileFilterSite, fileFilterDateRange, fileFilterDisplayName, debouncedDisplayNameSearch, fileFilterExportType, fileView, currentPage, pageSize, shops]);

  // 当页码或每页条数变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [fileFilterShop, fileFilterPlatform, fileFilterSite, fileFilterDateRange, fileFilterDisplayName, debouncedDisplayNameSearch, fileFilterExportType, fileView, pageSize]);

  useEffect(() => {
    if (activeTab === "files") {
      loadFiles();
    }
  }, [activeTab, loadFiles]);

  // 文件选择操作
  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const toggleAllFiles = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.id)));
    }
  };

  // 导出选中文件
  const exportSelectedFiles = async () => {
    const selectedFileData = files.filter((f) => selectedFiles.has(f.id));

    if (selectedFileData.length === 0) {
      setError("请先选择要导出的文件");
      return;
    }

    generateCSVAndDownload(selectedFileData);
  };

  // 按页数导出
  const exportCurrentPage = async () => {
    if (files.length === 0) {
      setError("当前页没有文件可导出");
      return;
    }

    generateCSVAndDownload(files);
  };

  // 生成CSV并下载
  const generateCSVAndDownload = (fileData: typeof files) => {
    // 生成 CSV 内容
    const headers = ["序号", "原始文件名", "保存文件名", "店铺", "站点", "平台", "文件大小", "上传时间"];
    const rows = fileData.map((f, idx) => [
      idx + 1,
      f.original_name,
      f.display_name || f.stored_key.split("/").pop() || f.stored_key,
      f.shops?.name || "-",
      f.shops?.site || "-",
      f.shops?.platform || "-",
      formatFileSize(parseInt(f.file_size)),
      formatDate(f.created_at),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // 下载 CSV
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `上传记录_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 导出按钮点击处理（打开选择弹窗）
  const handleExportClick = () => {
    setExportModalOpen(true);
  };

  const loadExportJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/export-jobs?limit=10", { credentials: "include" });
      const data = await response.json();
      if (response.ok && data.success) setExportJobs(data.data);
    } catch {
      // 任务轮询失败不覆盖文件列表错误提示，下一轮会自动重试。
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "files") return;
    loadExportJobs();
    const timer = window.setInterval(() => loadExportJobs(), 3000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadExportJobs]);

  const createExportJob = async (fileIds: string[]) => {
    const uniqueIds = [...new Set(fileIds)];
    if (uniqueIds.length === 0) {
      setError("没有可下载的文件");
      return;
    }
    setDownloading(true);
    setDownloadStatus(`正在创建 ${uniqueIds.length} 个文件的异步任务…`);
    try {
      const response = await fetch("/api/export-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileIds: uniqueIds, includeHistory: fileView === "history" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "创建任务失败");
      setDownloadStatus("任务已创建，可离开页面，完成后回来下载");
      setSelectedFiles(new Set());
      setDownloadModalOpen(false);
      setPageRangeModalOpen(false);
      await loadExportJobs();
    } catch (error) {
      setError(error instanceof Error ? error.message : "创建导出任务失败");
    } finally {
      window.setTimeout(() => { setDownloading(false); setDownloadStatus(""); }, 1200);
    }
  };

  const cancelExportJob = async (jobId: string) => {
    await fetch(`/api/export-jobs?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE", credentials: "include" });
    await loadExportJobs();
  };

  // 下载任务在后台流式生成 ZIP，页面关闭后也会继续处理。
  const batchDownloadFiles = async () => {
    if (selectedFiles.size === 0) {
      setError("请先选择要下载的文件");
      return;
    }

    await createExportJob(Array.from(selectedFiles));
  };

  // 下载按钮点击处理（打开选择弹窗）
  const handleDownloadClick = () => {
    setDownloadModalOpen(true);
  };

  const createPageRangeExportJob = async () => {
    const totalPages = Math.ceil(totalCount / pageSize);
    if (downloadStartPage < 1 || downloadEndPage > totalPages || downloadStartPage > downloadEndPage) {
      setError(`页数范围无效，请输入 1-${totalPages} 之间的页数`);
      return;
    }
    try {
      setDownloading(true);
      setDownloadStatus("正在获取文件列表…");
      const ids: string[] = [];
      for (let page = downloadStartPage; page <= downloadEndPage; page += 1) {
        const response = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            limit: pageSize,
            offset: (page - 1) * pageSize,
            shopIds: fileFilterShop,
            platforms: fileFilterPlatform,
            sites: fileFilterSite,
            periodLabels: fileFilterDateRange,
            displayNames: fileFilterDisplayName,
            displayNameContains: debouncedDisplayNameSearch,
            exportTypes: fileFilterExportType,
            view: fileView,
            includeOptions: false,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "获取文件列表失败");
        ids.push(...(data.data as UploadedFile[]).map((file) => file.id));
      }
      await createExportJob(ids);
    } catch (error) {
      setError(error instanceof Error ? error.message : "创建下载任务失败");
      setDownloading(false);
      setDownloadStatus("");
    }
  };

  // 批量删除选中文件
  const batchDeleteFiles = async () => {
    if (selectedFiles.size === 0) {
      setError("请先选择要删除的文件");
      return;
    }

    if (!confirm(`确定将选中的 ${selectedFiles.size} 条记录移入回收站吗？之后可以恢复。`)) {
      return;
    }

    try {
      setDownloading(true);
      setDownloadProgress(0);
      setDownloadStatus("正在删除...");

      const fileIds = Array.from(selectedFiles);
      let successCount = 0;
      let failCount = 0;

      for (const fileId of fileIds) {
        setDownloadStatus(`正在删除: ${fileId.substring(0, 8)}...`);
        try {
          const res = await fetch(`/api/files?id=${fileId}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
        setDownloadProgress(((successCount + failCount) / fileIds.length) * 100);
      }

      setSelectedFiles(new Set());
      loadFiles();

      setDownloadStatus(`删除完成！成功: ${successCount}, 失败: ${failCount}`);
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress(0);
        setDownloadStatus("");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus("");
    }
  };

  // 删除文件记录
  const handleDeleteFileRecord = async (fileId: string) => {
    if (!confirm("确定将这条记录移入回收站吗？")) return;
    try {
      const res = await fetch(`/api/files?id=${fileId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        loadFiles();
        setSelectedFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const restoreFiles = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const response = await fetch("/api/files/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "恢复失败");
      setSelectedFiles(new Set());
      await loadFiles();
    } catch (error) {
      setError(error instanceof Error ? error.message : "恢复失败");
    }
  };

  const correctPeriod = async (file: UploadedFile) => {
    const periodLabel = window.prompt("归属期间标签（例如 2026-08）", file.period_label || "");
    if (periodLabel === null) return;
    const periodStart = window.prompt("开始日期（YYYY-MM-DD，可留空）", file.period_start || "");
    if (periodStart === null) return;
    const periodEnd = window.prompt("结束日期（YYYY-MM-DD，可留空）", file.period_end || "");
    if (periodEnd === null) return;
    const response = await fetch("/api/files/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [file.id], periodLabel, periodStart, periodEnd }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) setError(data.error || "期间修正失败");
    else await loadFiles();
  };

  // ========== 命名规则操作 ==========
  const openRuleModal = (rule?: NamingRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({ name: rule.name, pattern: rule.pattern, description: rule.description || "", export_type: rule.export_type || "" });
    } else {
      setEditingRule(null);
      setRuleForm({ name: "", pattern: "{original}", description: "", export_type: "" });
    }
    setRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.name || !ruleForm.pattern) {
      setError("请填写名称和规则");
      return;
    }
    setRuleSaving(true);
    setError(null);
    try {
      const url = editingRule ? "/api/rules" : "/api/rules";
      const method = editingRule ? "PUT" : "POST";
      // 将空字符串转为 null
      const body = {
        ...ruleForm,
        export_type: ruleForm.export_type || null,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setRuleModalOpen(false);
        loadData();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setRuleSaving(false);
    }
  };

  const handleToggleRule = async (rule: NamingRule) => {
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      });
      const data = await res.json();
      if (data.success) loadData();
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleId) return;
    setRuleDeleting(true);
    try {
      const res = await fetch(`/api/rules?id=${deleteRuleId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { setDeleteRuleId(null); loadData(); }
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setRuleDeleting(false);
    }
  };

  // ========== 店铺操作 ==========
  const openShopModal = (shop?: Shop) => {
    if (shop) {
      setEditingShop(shop);
      setShopForm({ name: shop.name, site: shop.site, platform: shop.platform, description: shop.description || "", export_type: shop.export_type || "", manager: shop.manager || "" });
    } else {
      setEditingShop(null);
      setShopForm({ name: "", site: "", platform: "", description: "", export_type: "", manager: "" });
    }
    setShopPreview([]);
    setShopModalOpen(true);
  };

  const handleShopFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingShops(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shops/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setShopPreview(data.shops);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setImportingShops(false);
    }
  };

  const handleSaveShop = async () => {
    if (shopPreview.length > 0) {
      // 批量导入
      setShopSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/shops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shops: shopPreview }),
        });
        const data = await res.json();
        if (data.success) {
          setShopModalOpen(false);
          loadData();
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "导入失败");
      } finally {
        setShopSaving(false);
      }
    } else if (shopForm.name && shopForm.site && shopForm.platform) {
      // 单个添加/编辑
      setShopSaving(true);
      setError(null);
      try {
        const url = editingShop ? "/api/shops" : "/api/shops";
        const method = editingShop ? "PUT" : "POST";
        const body = editingShop 
          ? { id: editingShop.id, ...shopForm, export_type: shopForm.export_type || null, manager: shopForm.manager || null } 
          : { ...shopForm, export_type: shopForm.export_type || null, manager: shopForm.manager || null };
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) {
          setShopModalOpen(false);
          loadData();
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      } finally {
        setShopSaving(false);
      }
    } else {
      setError("请填写完整信息或上传Excel文件");
    }
  };

  const handleToggleShop = async (shop: Shop) => {
    try {
      const res = await fetch("/api/shops", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shop.id, is_active: !shop.is_active }),
      });
      const data = await res.json();
      if (data.success) loadData();
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDeleteShop = async () => {
    if (!deleteShopId) return;
    setShopDeleting(true);
    try {
      const res = await fetch(`/api/shops?id=${deleteShopId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { setDeleteShopId(null); loadData(); }
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setShopDeleting(false);
    }
  };

  const handleBatchDeleteShops = async () => {
    if (selectedShops.size === 0) return;
    setShopBatchDeleting(true);
    try {
      const ids = Array.from(selectedShops);
      const res = await fetch(`/api/shops?ids=${ids.join(",")}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setSelectedShops(new Set());
        setBatchDeleteShopOpen(false);
        loadData();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setShopBatchDeleting(false);
    }
  };

  const handleClearAllShops = async () => {
    if (!confirm("确定要清空所有店铺吗？此操作不可撤销。")) return;
    try {
      const res = await fetch("/api/shops?clearAll=true", { method: "DELETE" });
      const data = await res.json();
      if (data.success) loadData();
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空失败");
    }
  };

  // ========== 自定义变量操作 ==========
  const openVarModal = (v?: CustomVariable) => {
    if (v) {
      setEditingVar(v);
      setVarForm({ name: v.name, value: v.value, description: v.description || "" });
    } else {
      setEditingVar(null);
      setVarForm({ name: "", value: "", description: "" });
    }
    setVarModalOpen(true);
  };

  const handleSaveVar = async () => {
    if (!varForm.name || !varForm.value) {
      setError("请填写变量名和值");
      return;
    }
    setVarSaving(true);
    setError(null);
    try {
      const url = editingVar ? "/api/variables" : "/api/variables";
      const method = editingVar ? "PUT" : "POST";
      const body = editingVar ? { id: editingVar.id, ...varForm } : varForm;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        setVarModalOpen(false);
        loadData();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setVarSaving(false);
    }
  };

  const handleToggleVar = async (v: CustomVariable) => {
    try {
      const res = await fetch("/api/variables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, is_active: !v.is_active }),
      });
      const data = await res.json();
      if (data.success) loadData();
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleDeleteVar = async () => {
    if (!deleteVarId) return;
    setVarDeleting(true);
    try {
      const res = await fetch(`/api/variables?id=${deleteVarId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { setDeleteVarId(null); loadData(); }
      else setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setVarDeleting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* 头部 */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              文件收集系统 - 管理后台
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mr-4">
              返回上传页
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${isMainAccount ? "grid-cols-6" : "grid-cols-2"} mb-6`}>
            <TabsTrigger value="files" className="gap-2">
              <File className="w-4 h-4" />
              上传记录
              {files.length > 0 && <Badge variant="secondary" className="ml-1">{files.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="progress" className="gap-2">
              <File className="w-4 h-4" />
              收集进度
            </TabsTrigger>
            {isMainAccount && (
              <>
                <TabsTrigger value="rules" className="gap-2">
                  <FileText className="w-4 h-4" />
                  命名规则
                </TabsTrigger>
                <TabsTrigger value="shops" className="gap-2">
                  <ShoppingBag className="w-4 h-4" />
                  店铺列表
                  {shops.length > 0 && <Badge variant="secondary" className="ml-1">{shops.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="variables" className="gap-2">
                  <Variable className="w-4 h-4" />
                  自定义变量
                  {variables.length > 0 && <Badge variant="secondary" className="ml-1">{variables.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="accounts" className="gap-2">
                  <Settings className="w-4 h-4" />
                  账号管理
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* 上传记录 */}
          <TabsContent value="files">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <File className="w-5 h-5" />
                      上传记录
                    </CardTitle>
                    <CardDescription>查看所有上传文件记录，支持批量导出/下载</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={fileView} onValueChange={(value) => setFileView(value as "current" | "history" | "trash")}>
                      <SelectTrigger className="w-[140px]" aria-label="文件视图">
                        <History className="mr-2 size-4" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">当前版本</SelectItem>
                        <SelectItem value="history">全部版本</SelectItem>
                        <SelectItem value="trash">回收站</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={fileDisplayNameSearch}
                      onChange={(event) => setFileDisplayNameSearch(event.target.value)}
                      placeholder="模糊搜索保存文件名"
                      aria-label="模糊搜索保存文件名"
                      className="w-[190px]"
                    />
                    <SearchSelect
                      value={fileFilterExportType}
                      onValueChange={setFileFilterExportType as (value: string | string[]) => void}
                      placeholder="全部保存类型"
                      className="min-w-[140px]"
                      multiple
                      showSelectAll
                    >
                      {availableFileExportTypes.map((type) => (
                        <SearchSelectItem key={type} value={type}>{type}</SearchSelectItem>
                      ))}
                    </SearchSelect>
                    <SearchSelect
                      value={fileFilterPlatform}
                      onValueChange={setFileFilterPlatform as (value: string | string[]) => void}
                      placeholder="全部平台"
                      className="min-w-[120px]"
                      maxDisplayItems={5}
                      multiple
                      showSelectAll
                    >
                      {availablePlatforms.map((platform) => (
                        <SearchSelectItem key={platform} value={platform}>
                          {platform}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    <SearchSelect
                      value={fileFilterSite}
                      onValueChange={setFileFilterSite as (value: string | string[]) => void}
                      placeholder="全部站点"
                      className="min-w-[120px]"
                      maxDisplayItems={5}
                      multiple
                      showSelectAll
                    >
                      {availableSites.map((site) => (
                        <SearchSelectItem key={site} value={site}>
                          {site}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    <SearchSelect
                      value={fileFilterShop}
                      onValueChange={setFileFilterShop as (value: string | string[]) => void}
                      placeholder="全部店铺"
                      className="min-w-[150px]"
                      maxDisplayItems={8}
                      multiple
                      showSelectAll
                    >
                      {availableShops.map((shop) => (
                        <SearchSelectItem key={shop.id} value={shop.id}>
                          {shop.name}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    <SearchSelect
                      value={fileFilterDateRange}
                      onValueChange={setFileFilterDateRange as (value: string | string[]) => void}
                      placeholder="日期区间"
                      className="min-w-[180px]"
                      maxDisplayItems={10}
                      multiple
                      showSelectAll
                    >
                      <SearchSelectItem key="__NONE__" value="__NONE__">
                        未识别
                      </SearchSelectItem>
                      {availableDateRanges.map((range) => (
                        <SearchSelectItem key={range} value={range}>
                          {range}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    <SearchSelect
                      value={fileFilterDisplayName}
                      onValueChange={setFileFilterDisplayName as (value: string | string[]) => void}
                      placeholder="保存文件名"
                      className="min-w-[150px]"
                      maxDisplayItems={10}
                      multiple
                      showSelectAll
                    >
                      <SearchSelectItem key="__NONE__" value="__NONE__">
                        未设置
                      </SearchSelectItem>
                      {availableDisplayNames.map((name) => (
                        <SearchSelectItem key={name} value={name}>
                          {name}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    {/* 导出和下载按钮 - 主账号和子账号都可用 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportClick}
                      disabled={selectedFiles.size === 0}
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      导出上传记录 ({selectedFiles.size})
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDownloadClick}
                      disabled={downloading}
                      className="gap-2"
                    >
                      {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FolderDown className="w-4 h-4" />
                      )}
                      {downloading ? "下载中..." : "批量下载"}
                    </Button>
                    {fileView === "trash" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreFiles(Array.from(selectedFiles))}
                        disabled={selectedFiles.size === 0 || downloading}
                        className="gap-2"
                      >
                        <ArchiveRestore className="w-4 h-4" />
                        恢复所选 {selectedFiles.size > 0 && `(${selectedFiles.size})`}
                      </Button>
                    ) : isMainAccount ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={batchDeleteFiles}
                        disabled={selectedFiles.size === 0 || downloading}
                        className="gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        移入回收站 {selectedFiles.size > 0 && `(${selectedFiles.size})`}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {/* 下载进度显示 */}
                {downloading && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{downloadStatus}</span>
                      <span className="text-slate-500">{Math.round(downloadProgress)}%</span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                  </div>
                )}
                {exportJobs.length > 0 && (
                  <div className="mt-4 space-y-2 rounded-lg border bg-slate-50 p-3 dark:bg-slate-900" aria-live="polite">
                    <div className="text-sm font-medium">最近的后台导出任务</div>
                    {exportJobs.slice(0, 5).map((job) => {
                      const progress = job.file_count > 0
                        ? Math.min(100, Math.round((job.processed_count / job.file_count) * 100))
                        : 0;
                      return (
                        <div key={job.id} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
                                {{ pending: "等待中", processing: "处理中", completed: "已完成", failed: "失败", cancelled: "已取消" }[job.status]}
                              </Badge>
                              <span>{job.processed_count}/{job.file_count} 个文件</span>
                              {job.failed_count > 0 && <span className="text-amber-600">失败 {job.failed_count}</span>}
                              <span className="text-muted-foreground">{formatDate(job.created_at)}</span>
                            </div>
                            {(job.status === "pending" || job.status === "processing") && <Progress value={progress} className="mt-2 h-1.5" />}
                            {job.error_message && <p className="mt-1 truncate text-xs text-red-600" title={job.error_message}>{job.error_message}</p>}
                          </div>
                          <div className="flex gap-2">
                            {job.status === "completed" && job.result_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={job.result_url} target="_blank" rel="noreferrer">下载 ZIP</a>
                              </Button>
                            )}
                            {(job.status === "pending" || job.status === "processing") && (
                              <Button size="sm" variant="ghost" onClick={() => cancelExportJob(job.id)}>取消</Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {filesLoading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无上传记录</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <button
                              onClick={toggleAllFiles}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            >
                              {selectedFiles.size === files.length && files.length > 0 ? (
                                <CheckSquare className="w-4 h-4 text-blue-500" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </TableHead>
                          <TableHead>原始文件名</TableHead>
                          <TableHead>日期区间</TableHead>
                          <TableHead>保存文件名</TableHead>
                          <TableHead>店铺</TableHead>
                          <TableHead>文件大小</TableHead>
                          <TableHead>上传时间</TableHead>
                          <TableHead>版本</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {files.map((file) => (
                          <TableRow key={file.id} className={selectedFiles.has(file.id) ? "bg-blue-50 dark:bg-blue-950" : ""}>
                            <TableCell>
                              <button
                                onClick={() => toggleFileSelection(file.id)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                              >
                                {selectedFiles.has(file.id) ? (
                                  <CheckSquare className="w-4 h-4 text-blue-500" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate" title={file.original_name}>
                              {file.original_name}
                            </TableCell>
                            <TableCell className="text-sm">
                              {file.date_range ? (
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {file.date_range}
                                </Badge>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500 max-w-[200px] truncate" title={file.display_name || file.stored_key}>
                              {file.display_name || file.stored_key.split("/").pop()}
                            </TableCell>
                            <TableCell>
                              {file.shops ? (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="outline">{file.shops.name}</Badge>
                                  <span className="text-xs text-slate-400">
                                    {file.shops.site} / {file.shops.platform}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>{formatFileSize(parseInt(file.file_size))}</TableCell>
                            <TableCell className="text-slate-500 text-sm">{formatDate(file.created_at)}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge variant={file.is_current ? "default" : "secondary"}>v{file.version || 1}</Badge>
                                {file.is_deleted && <span className="text-xs text-red-500">已删除</span>}
                                {!file.is_deleted && !file.is_current && <span className="text-xs text-slate-400">历史</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => window.open(`/api/files/download?key=${encodeURIComponent(file.stored_key)}`, "_blank")}
                                      className="text-blue-500"
                                    >
                                      <LinkIcon className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>查看文件</TooltipContent>
                                </Tooltip>
                                {fileView === "trash" ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => restoreFiles([file.id])} className="text-emerald-600">
                                        <ArchiveRestore className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>恢复文件</TooltipContent>
                                  </Tooltip>
                                ) : isMainAccount ? (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => correctPeriod(file)} className="text-amber-600">
                                          <Edit2 className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>修正归属期间</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteFileRecord(file.id)}
                                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>删除记录</TooltipContent>
                                    </Tooltip>
                                  </>
                                ) : null}
                                {isSubAccount && (
                                  <span className="text-xs text-slate-400">仅查看</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    {/* 分页控件 */}
                    {totalCount > 0 && (
                      <div className="flex items-center justify-between mt-4 px-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span>每页显示</span>
                          <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="border rounded px-2 py-1 bg-background"
                          >
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                          <span>条</span>
                          <span className="ml-2">共 {totalCount} 条记录</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                          >
                            首页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            上一页
                          </Button>
                          <span className="px-3 text-sm">
                            第 {currentPage} / {Math.ceil(totalCount / pageSize)} 页
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                          >
                            下一页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))}
                            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                          >
                            末页
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 导出方式选择弹窗 */}
                    <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>选择导出方式</DialogTitle>
                          <DialogDescription>请选择导出上传记录的方式</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 py-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setExportModalOpen(false);
                              exportSelectedFiles();
                            }}
                            className="justify-start h-auto py-3"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-medium">按勾选导出</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                导出已选中的 {selectedFiles.size} 条记录
                              </span>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setExportModalOpen(false);
                              exportCurrentPage();
                            }}
                            className="justify-start h-auto py-3"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-medium">按页数导出</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                导出当前页 {files.length} 条记录
                              </span>
                            </div>
                          </Button>
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setExportModalOpen(false)}>
                            取消
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 下载方式选择弹窗 */}
                    <Dialog open={downloadModalOpen} onOpenChange={setDownloadModalOpen}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>选择下载方式</DialogTitle>
                          <DialogDescription>请选择批量下载文件的方式</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 py-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDownloadModalOpen(false);
                              batchDownloadFiles();
                            }}
                            className="justify-start h-auto py-3"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-medium">按勾选下载</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                下载已选中的 {selectedFiles.size} 个文件
                              </span>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDownloadModalOpen(false);
                              // 初始化页数范围
                              const totalPages = Math.ceil(totalCount / pageSize);
                              setDownloadStartPage(1);
                              setDownloadEndPage(totalPages);
                              setPageRangeModalOpen(true);
                            }}
                            className="justify-start h-auto py-3"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-medium">按页数范围下载</span>
                              <span className="text-xs text-muted-foreground font-normal">
                                下载指定页数范围的 {files.length} 个文件
                              </span>
                            </div>
                          </Button>
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setDownloadModalOpen(false)}>
                            取消
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 页数范围下载弹窗 */}
                    <Dialog open={pageRangeModalOpen} onOpenChange={setPageRangeModalOpen}>
                      <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle>输入页数范围</DialogTitle>
                          <DialogDescription>
                            共 {totalCount} 条记录，每页 {pageSize} 条，共 {Math.ceil(totalCount / pageSize)} 页
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 py-4">
                          <div className="flex items-center gap-2">
                            <Label>从第</Label>
                            <Input
                              type="number"
                              min={1}
                              max={Math.ceil(totalCount / pageSize)}
                              value={downloadStartPage}
                              onChange={(e) => setDownloadStartPage(Math.max(1, Math.min(Math.ceil(totalCount / pageSize), parseInt(e.target.value) || 1)))}
                              className="w-20"
                            />
                            <Label>页</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label>到第</Label>
                            <Input
                              type="number"
                              min={1}
                              max={Math.ceil(totalCount / pageSize)}
                              value={downloadEndPage}
                              onChange={(e) => setDownloadEndPage(Math.max(1, Math.min(Math.ceil(totalCount / pageSize), parseInt(e.target.value) || 1)))}
                              className="w-20"
                            />
                            <Label>页</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setPageRangeModalOpen(false)}>
                            取消
                          </Button>
                          <Button onClick={createPageRangeExportJob} disabled={downloading}>
                            {downloading ? "下载中..." : "确认下载"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 文件收集进度 */}
          <TabsContent value="progress">
            <Card className="shadow-lg">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <File className="w-5 h-5" />
                    文件收集进度
                  </CardTitle>
                  <CardDescription>查看各店铺各保存类型的文件收集情况</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <CollectionProgressTable />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 命名规则管理 */}
          <TabsContent value="rules">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      命名规则管理
                    </CardTitle>
                    <CardDescription>配置文件上传时的命名规则，支持变量替换</CardDescription>
                  </div>
                  <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => openRuleModal()}><Plus className="w-4 h-4 mr-2" />新增规则</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>{editingRule ? "编辑规则" : "新增规则"}</DialogTitle>
                        <DialogDescription>{editingRule ? "修改命名规则配置" : "创建一个新的命名规则"}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="ruleName">规则名称</Label>
                          <Input id="ruleName" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="例如: 素材文件命名" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ruleExportType">关联的文件保存类型</Label>
                          <SearchSelect
                            value={ruleForm.export_type}
                            onValueChange={(val) => setRuleForm({ ...ruleForm, export_type: typeof val === 'string' ? val : val[0] || '' })}
                            placeholder="-- 通用规则（所有类型可用）--"
                            className="w-full"
                          >
                            <SearchSelectItem value="">-- 通用规则（所有类型可用）--</SearchSelectItem>
                            {availableExportTypes.map((type) => (
                              <SearchSelectItem key={type} value={type}>{type}</SearchSelectItem>
                            ))}
                          </SearchSelect>
                          <p className="text-xs text-slate-500">选择该规则关联的保存类型。不选则为通用规则。</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rulePattern">命名模式</Label>
                          <Input id="rulePattern" value={ruleForm.pattern} onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })} placeholder="{date}_{original}" />
                          <p className="text-xs text-slate-500">支持变量: {"{original}"} {"{date}"} {"{time}"} {"{datetime}"} {"{random}"} {"{timestamp}"} {"{shop}"} {"{shop_name}"} {"{shop_site}"} {"{shop_platform}"} {"{export_type}"} {"{自定义变量}"}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ruleDesc">描述说明</Label>
                          <Textarea id="ruleDesc" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="规则的用途说明..." rows={3} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRuleModalOpen(false)}>取消</Button>
                        <Button onClick={handleSaveRule} disabled={ruleSaving}>{ruleSaving ? "保存中..." : "保存"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无命名规则，点击上方按钮添加</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>规则名称</TableHead>
                        <TableHead>关联类型</TableHead>
                        <TableHead>命名模式</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>
                            {rule.export_type ? (
                              <Badge variant="outline">{rule.export_type}</Badge>
                            ) : (
                              <span className="text-slate-400 text-sm">通用规则</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{rule.pattern}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch checked={rule.is_active} onCheckedChange={() => handleToggleRule(rule)} />
                              <span className={`text-xs ${rule.is_active ? "text-green-600" : "text-slate-400"}`}>{rule.is_active ? "启用" : "禁用"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">{formatDate(rule.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => openRuleModal(rule)}><Edit2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>编辑</TooltipContent></Tooltip>
                              <Dialog open={deleteRuleId === rule.id} onOpenChange={(o) => !o && setDeleteRuleId(null)}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteRuleId(rule.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>确定要删除规则 &quot;{rule.name}&quot; 吗？此操作无法撤销。</DialogDescription></DialogHeader>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteRuleId(null)}>取消</Button>
                                    <Button variant="destructive" onClick={handleDeleteRule} disabled={ruleDeleting}>{ruleDeleting ? "删除中..." : "删除"}</Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 店铺列表管理 */}
          <TabsContent value="shops">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5" />
                      店铺列表管理
                    </CardTitle>
                    <CardDescription>上传 Excel 文件批量导入店铺，支持单条添加</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {shops.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleClearAllShops} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" />
                        清空全部
                      </Button>
                    )}
                    <Dialog open={shopModalOpen} onOpenChange={setShopModalOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => openShopModal()}><Plus className="w-4 h-4 mr-2" />添加店铺</Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>{editingShop ? "编辑店铺" : "添加店铺"}</DialogTitle>
                          <DialogDescription>上传 Excel 文件或手动输入店铺信息</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {/* Excel 导入 */}
                          {!editingShop && (
                            <div className="space-y-2">
                              <Label>Excel 文件导入</Label>
                              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center">
                                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                <p className="text-sm text-slate-500 mb-2">拖拽或点击上传 Excel 文件</p>
                                <p className="text-xs text-slate-400 mb-1">A-C列：站点、平台、店铺名；D列为导出类型（可选）；E列为负责人（可选）</p>
                                <p className="text-xs text-slate-400">导出类型示例：订单、收入、广告费</p>
                                <input type="file" accept=".xlsx,.xls" onChange={handleShopFileChange} className="hidden" id="shop-file" />
                                <label htmlFor="shop-file">
                                  <Button variant="outline" size="sm" asChild disabled={importingShops}>
                                    <span>{importingShops ? "解析中..." : "选择文件"}</span>
                                  </Button>
                                </label>
                              </div>
                              {shopPreview.length > 0 && (
                                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                                  <p className="text-sm text-green-700 dark:text-green-300 mb-2">预览到 {shopPreview.length} 条数据：</p>
                                  <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                                    {shopPreview.slice(0, 5).map((s, i) => (
                                      <p key={i} className="text-slate-600 dark:text-slate-400">
                                        {s.site} | {s.platform} | {s.name}
                                        {s.export_type && <span className="ml-2 text-blue-600">类型: {s.export_type}</span>}
                                        {s.manager && <span className="ml-2 text-purple-600">负责人: {s.manager}</span>}
                                      </p>
                                    ))}
                                    {shopPreview.length > 5 && <p className="text-slate-400">...还有 {shopPreview.length - 5} 条</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {editingShop && (
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-2">
                              <p className="text-sm text-blue-700 dark:text-blue-300">编辑模式：仅修改表单内容</p>
                            </div>
                          )}
                          <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">手动{editingShop ? "编辑" : "添加"}</span></div></div>
                          {/* 手动添加 */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="shopSite">站点</Label>
                              <Input id="shopSite" value={shopForm.site} onChange={(e) => setShopForm({ ...shopForm, site: e.target.value })} placeholder="如: 中国" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="shopPlatform">平台</Label>
                              <Input id="shopPlatform" value={shopForm.platform} onChange={(e) => setShopForm({ ...shopForm, platform: e.target.value })} placeholder="如: 淘宝" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="shopName">店铺名</Label>
                              <Input id="shopName" value={shopForm.name} onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })} placeholder="如: 旗舰店" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="shopExportType">导出类型</Label>
                              <Input id="shopExportType" value={shopForm.export_type} onChange={(e) => setShopForm({ ...shopForm, export_type: e.target.value })} placeholder="如: 订单、收入、广告费" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="shopManager">负责人</Label>
                              <Input id="shopManager" value={shopForm.manager} onChange={(e) => setShopForm({ ...shopForm, manager: e.target.value })} placeholder="请输入负责人" />
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShopModalOpen(false)}>取消</Button>
                          <Button onClick={handleSaveShop} disabled={shopSaving}>{shopSaving ? "保存中..." : shopPreview.length > 0 ? `导入 ${shopPreview.length} 条` : "保存"}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* 店铺列表筛选器 */}
                {shops.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-sm text-slate-500">筛选:</span>
                    <SearchSelect
                      value={shopFilterSite}
                      onValueChange={setShopFilterSite as (value: string | string[]) => void}
                      placeholder="全部站点"
                      className="min-w-[120px]"
                      maxDisplayItems={5}
                      multiple
                    >
                      {[...new Set(shops.map((s) => s.site))].map((site) => (
                        <SearchSelectItem key={site} value={site}>{site}</SearchSelectItem>
                      ))}
                    </SearchSelect>
                    {shopFilterSite.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShopFilterSite([])}
                      >
                        清除筛选
                      </Button>
                    )}
                  </div>
                )}
                {loading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : shops.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无店铺，点击上方按钮添加</div>
                ) : (
                  <>
                    {/* 批量操作工具栏 */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">
                          共 {shops.filter((s) => shopFilterSite.length === 0 || shopFilterSite.includes(s.site)).length} 个店铺
                          {selectedShops.size > 0 && ` | 已选择 ${selectedShops.size} 个`}
                        </span>
                      </div>
                      {selectedShops.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setBatchDeleteShopOpen(true)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          批量删除 ({selectedShops.size})
                        </Button>
                      )}
                    </div>
                    {/* 批量删除确认弹窗 */}
                    <Dialog open={batchDeleteShopOpen} onOpenChange={setBatchDeleteShopOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>确认批量删除</DialogTitle>
                          <DialogDescription>
                            确定要删除选中的 {selectedShops.size} 个店铺吗？此操作不可撤销。
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setBatchDeleteShopOpen(false)}>取消</Button>
                          <Button variant="destructive" onClick={handleBatchDeleteShops} disabled={shopBatchDeleting}>
                            {shopBatchDeleting ? "删除中..." : "确认删除"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <input
                              type="checkbox"
                              checked={(() => {
                                const filteredShops = shopFilterSite.length > 0
                                  ? shops.filter((s) => shopFilterSite.includes(s.site))
                                  : shops;
                                return filteredShops.length > 0 && filteredShops.every((s) => selectedShops.has(s.id));
                              })()}
                              onChange={(e) => {
                                const filteredShops = shopFilterSite.length > 0
                                  ? shops.filter((s) => shopFilterSite.includes(s.site))
                                  : shops;
                                if (e.target.checked) {
                                  setSelectedShops(new Set([...selectedShops, ...filteredShops.map((s) => s.id)]));
                                } else {
                                  const newSelected = new Set(selectedShops);
                                  filteredShops.forEach((s) => newSelected.delete(s.id));
                                  setSelectedShops(newSelected);
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </TableHead>
                          <TableHead>店铺名</TableHead>
                          <TableHead>站点</TableHead>
                          <TableHead>平台</TableHead>
                          <TableHead>导出类型</TableHead>
                          <TableHead>负责人</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>创建时间</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const filteredShops = shopFilterSite.length > 0
                            ? shops.filter((s) => shopFilterSite.includes(s.site))
                            : shops;
                          return filteredShops.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                                没有匹配筛选条件的店铺
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredShops.map((shop) => (
                              <TableRow key={shop.id}>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedShops.has(shop.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedShops);
                                      if (e.target.checked) {
                                        newSelected.add(shop.id);
                                      } else {
                                        newSelected.delete(shop.id);
                                      }
                                      setSelectedShops(newSelected);
                                    }}
                                    className="w-4 h-4 rounded border-gray-300"
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{shop.name}</TableCell>
                                <TableCell><Badge variant="outline">{shop.site}</Badge></TableCell>
                                <TableCell><Badge variant="secondary">{shop.platform}</Badge></TableCell>
                                <TableCell>
                                  {shop.export_type ? (
                                    <Badge variant="default">{shop.export_type}</Badge>
                                  ) : (
                                    <span className="text-slate-400 text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {shop.manager ? (
                                    <span className="text-sm">{shop.manager}</span>
                                  ) : (
                                    <span className="text-slate-400 text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Switch checked={shop.is_active} onCheckedChange={() => handleToggleShop(shop)} />
                                    <span className={`text-xs ${shop.is_active ? "text-green-600" : "text-slate-400"}`}>{shop.is_active ? "启用" : "禁用"}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-slate-500 text-sm">{formatDate(shop.created_at)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => openShopModal(shop)}><Edit2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>编辑</TooltipContent></Tooltip>
                                    <Dialog open={deleteShopId === shop.id} onOpenChange={(o) => !o && setDeleteShopId(null)}>
                                      <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => setDeleteShopId(shop.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                                      </DialogTrigger>
                                      <DialogContent>
                                        <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>确定要删除店铺 &quot;{shop.name}&quot; 吗？</DialogDescription></DialogHeader>
                                        <DialogFooter>
                                          <Button variant="outline" onClick={() => setDeleteShopId(null)}>取消</Button>
                                          <Button variant="destructive" onClick={handleDeleteShop} disabled={shopDeleting}>{shopDeleting ? "删除中..." : "删除"}</Button>
                                        </DialogFooter>
                                      </DialogContent>
                                    </Dialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 自定义变量管理 */}
          <TabsContent value="variables">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Variable className="w-5 h-5" />
                      自定义变量
                    </CardTitle>
                    <CardDescription>添加自定义变量，可在命名规则中使用 {"{变量名}"} 引用</CardDescription>
                  </div>
                  <Dialog open={varModalOpen} onOpenChange={setVarModalOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => openVarModal()}><Plus className="w-4 h-4 mr-2" />新增变量</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>{editingVar ? "编辑变量" : "新增变量"}</DialogTitle>
                        <DialogDescription>创建自定义变量，如 {"{部门}"}、{"{项目}"} 等</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="varName">变量名</Label>
                          <Input id="varName" value={varForm.name} onChange={(e) => setVarForm({ ...varForm, name: e.target.value })} placeholder="{部门}" disabled={!!editingVar} />
                          <p className="text-xs text-slate-500">必须以 {"{"} 开头，{"}"} 结尾</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="varValue">变量值</Label>
                          <Input id="varValue" value={varForm.value} onChange={(e) => setVarForm({ ...varForm, value: e.target.value })} placeholder="如: 销售部" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="varDesc">描述说明</Label>
                          <Textarea id="varDesc" value={varForm.description} onChange={(e) => setVarForm({ ...varForm, description: e.target.value })} placeholder="变量的用途..." rows={2} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setVarModalOpen(false)}>取消</Button>
                        <Button onClick={handleSaveVar} disabled={varSaving}>{varSaving ? "保存中..." : "保存"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : variables.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无自定义变量，点击上方按钮添加</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>变量名</TableHead>
                        <TableHead>变量值</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variables.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono text-sm text-blue-600 dark:text-blue-400">{v.name}</TableCell>
                          <TableCell className="font-medium">{v.value}</TableCell>
                          <TableCell className="text-slate-500">{v.description || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch checked={v.is_active} onCheckedChange={() => handleToggleVar(v)} />
                              <span className={`text-xs ${v.is_active ? "text-green-600" : "text-slate-400"}`}>{v.is_active ? "启用" : "禁用"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => openVarModal(v)}><Edit2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>编辑</TooltipContent></Tooltip>
                              <Dialog open={deleteVarId === v.id} onOpenChange={(o) => !o && setDeleteVarId(null)}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteVarId(v.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>确定要删除变量 {v.name} 吗？</DialogDescription></DialogHeader>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setDeleteVarId(null)}>取消</Button>
                                    <Button variant="destructive" onClick={handleDeleteVar} disabled={varDeleting}>{varDeleting ? "删除中..." : "删除"}</Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 账号管理（仅主账号可见） */}
          <TabsContent value="accounts">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      账号管理
                    </CardTitle>
                    <CardDescription>管理系统账号，主账号可创建子账号</CardDescription>
                  </div>
                  <Dialog open={accountModalOpen} onOpenChange={setAccountModalOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => openAccountModal()}><Plus className="w-4 h-4 mr-2" />新增账号</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>{editingAccount ? "编辑账号" : "新增子账号"}</DialogTitle>
                        <DialogDescription>
                          {editingAccount ? "修改账号信息" : "创建一个新的子账号，子账号仅能查看上传记录和收集进度"}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="accountUsername">用户名</Label>
                          <Input
                            id="accountUsername"
                            value={accountForm.username}
                            onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                            placeholder="请输入用户名"
                            disabled={!!editingAccount}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="accountPassword">{editingAccount ? "新密码（留空不修改）" : "密码"}</Label>
                          <Input
                            id="accountPassword"
                            type="password"
                            value={accountForm.password}
                            onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                            placeholder={editingAccount ? "留空则不修改密码" : "请输入密码（至少4位）"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="accountDisplayName">显示名称</Label>
                          <Input
                            id="accountDisplayName"
                            value={accountForm.display_name}
                            onChange={(e) => setAccountForm({ ...accountForm, display_name: e.target.value })}
                            placeholder="请输入显示名称"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAccountModalOpen(false)}>取消</Button>
                        <Button onClick={handleSaveAccount} disabled={accountSaving}>{accountSaving ? "保存中..." : "保存"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loadingAccounts ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : accounts.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">暂无子账号，点击上方按钮添加</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>用户名</TableHead>
                        <TableHead>显示名称</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>最后登录</TableHead>
                        <TableHead>登录次数</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">{account.username}</TableCell>
                          <TableCell>{account.display_name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={account.role === "main" ? "default" : "secondary"}>
                              {account.role === "main" ? "主账号" : "子账号"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch checked={account.is_active} onCheckedChange={() => handleToggleAccount(account)} />
                              <span className={`text-xs ${account.is_active ? "text-green-600" : "text-slate-400"}`}>
                                {account.is_active ? "启用" : "禁用"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {account.last_login_at ? formatDate(account.last_login_at) : "-"}
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">{account.login_count || 0}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => openAccountModal(account)}>
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>编辑</TooltipContent>
                              </Tooltip>
                              {account.role !== "main" && (
                                <Dialog open={deleteAccountId === account.id} onOpenChange={(o) => !o && setDeleteAccountId(null)}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setDeleteAccountId(account.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>确认删除</DialogTitle>
                                      <DialogDescription>确定要删除账号 &quot;{account.username}&quot; 吗？此操作不可撤销。</DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <Button variant="outline" onClick={() => setDeleteAccountId(null)}>取消</Button>
                                      <Button variant="destructive" onClick={handleDeleteAccount} disabled={accountDeleting}>
                                        {accountDeleting ? "删除中..." : "删除"}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 变量说明卡片 */}
        <Card className="mt-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">可用变量说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{original}"}</code>
                <p className="text-slate-500">原始文件名（不含扩展名）</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{date}"}</code>
                <p className="text-slate-500">当前日期 (YYYY-MM-DD)</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{time}"}</code>
                <p className="text-slate-500">当前时间 (HHMMSS)</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{datetime}"}</code>
                <p className="text-slate-500">完整日期时间</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{random}"}</code>
                <p className="text-slate-500">8位随机字符</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 text-xs">{"{timestamp}"}</code>
                <p className="text-slate-500">时间戳（毫秒）</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-green-600 dark:text-green-400 text-xs">{"{shop}"}</code>
                <p className="text-slate-500">店铺名称（简写）</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-green-600 dark:text-green-400 text-xs">{"{shop_name}"}</code>
                <p className="text-slate-500">店铺名称（完整）</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-green-600 dark:text-green-400 text-xs">{"{shop_site}"}</code>
                <p className="text-slate-500">店铺所属站点</p>
              </div>
              <div className="space-y-1">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-green-600 dark:text-green-400 text-xs">{"{shop_platform}"}</code>
                <p className="text-slate-500">店铺所属平台</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// 文件收集进度表格组件
function CollectionProgressTable() {
  const [progressData, setProgressData] = useState<Array<{
    shopId: string;
    shopName: string;
    shopSite: string;
    shopPlatform: string;
    shopManager: string | null;
    exportType: string;
    uploadCount: number;
    lastUploadTime: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  // 筛选状态
  const [filterSite, setFilterSite] = useState<string[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterManager, setFilterManager] = useState<string[]>([]);
  const [filterUploaded, setFilterUploaded] = useState<string>(""); // "" | "yes" | "no"
  
  // 联动后的可用选项
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [availableManagers, setAvailableManagers] = useState<string[]>([]);

  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    setLoading(true);
    try {
      // 获取所有店铺
      const shopsRes = await fetch("/api/shops?active=true");
      const shopsData = await shopsRes.json();
      
      // 获取所有上传记录 - 使用 POST 避免 URL 过长
      const filesRes = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10000 }),
      });
      const filesData = await filesRes.json();

      if (shopsData.success && filesData.success) {
        const shops = shopsData.data || [];
        const files = filesData.data || [];
        
        // 统计数据
        const progressMap: Record<string, {
          shopId: string;
          shopName: string;
          shopSite: string;
          shopPlatform: string;
          shopManager: string | null;
          exportType: string;
          uploadCount: number;
          lastUploadTime: string | null;
        }> = {};

        // 遍历每个店铺
        shops.forEach((shop: Shop) => {
          if (!shop.export_type) return;
          
          // 拆分保存类型
          const exportTypes = shop.export_type.split(",").map((t: string) => t.trim()).filter(Boolean);
          
          exportTypes.forEach((exportType: string) => {
            const key = `${shop.id}_${exportType}`;
            
            // 查找该店铺该类型的上传记录
            const relatedFiles = files.filter((f: UploadedFile) => 
              f.shop_id === shop.id && f.export_type === exportType
            );

            progressMap[key] = {
              shopId: shop.id,
              shopName: shop.name,
              shopSite: shop.site,
              shopPlatform: shop.platform,
              shopManager: shop.manager || null,
              exportType: exportType,
              uploadCount: relatedFiles.length,
              lastUploadTime: relatedFiles.length > 0 
                ? relatedFiles.sort((a: UploadedFile, b: UploadedFile) => 
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )[0].created_at
                : null,
            };
          });
        });

        // 转换为数组并排序
        const progressList = Object.values(progressMap).sort((a, b) => {
          // 按店铺名排序，再按保存类型排序
          if (a.shopName !== b.shopName) {
            return a.shopName.localeCompare(b.shopName);
          }
          return a.exportType.localeCompare(b.exportType);
        });

        setProgressData(progressList);
        
        // 初始化联动选项
        const allPlatforms = [...new Set(progressList.map((d) => d.shopPlatform).filter(Boolean))].sort();
        const allSites = [...new Set(progressList.map((d) => d.shopSite).filter(Boolean))].sort();
        const allManagers = [...new Set(progressList.map((d) => d.shopManager).filter(Boolean) as string[])].sort();
        setAvailablePlatforms(allPlatforms);
        setAvailableSites(allSites);
        setAvailableManagers(allManagers);
      }
    } catch (err) {
      console.error("加载收集进度失败:", err);
    } finally {
      setLoading(false);
    }
  };

  // 联动计算逻辑：生成某个多选框的候选项时忽略该字段自身，
  // 保证同字段内可以继续多选；其他字段仍保持 AND 联动。
  useEffect(() => {
    if (progressData.length === 0) return;

    type ProgressFacet = "site" | "platform" | "manager";
    const rowsForFacet = (ignoredFacet: ProgressFacet) => progressData.filter((item) => {
      if (ignoredFacet !== "site" && filterSite.length > 0 && !filterSite.includes(item.shopSite)) {
        return false;
      }
      if (ignoredFacet !== "platform" && filterPlatform.length > 0 && !filterPlatform.includes(item.shopPlatform)) {
        return false;
      }
      if (ignoredFacet !== "manager" && filterManager.length > 0 && !filterManager.includes(item.shopManager || "")) {
        return false;
      }
      if (filterUploaded === "yes" && item.uploadCount === 0) return false;
      if (filterUploaded === "no" && item.uploadCount > 0) return false;
      return true;
    });

    setAvailablePlatforms([
      ...new Set(rowsForFacet("platform").map((item) => item.shopPlatform).filter(Boolean)),
    ].sort());
    setAvailableSites([
      ...new Set(rowsForFacet("site").map((item) => item.shopSite).filter(Boolean)),
    ].sort());
    setAvailableManagers([
      ...new Set(rowsForFacet("manager").map((item) => item.shopManager).filter(Boolean) as string[]),
    ].sort());
  }, [progressData, filterSite, filterPlatform, filterManager, filterUploaded]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 过滤后的数据
  const filteredData = progressData.filter((item) => {
    // 站点筛选
    if (filterSite.length > 0 && !filterSite.includes(item.shopSite)) {
      return false;
    }
    // 平台筛选
    if (filterPlatform.length > 0 && !filterPlatform.includes(item.shopPlatform)) {
      return false;
    }
    // 负责人筛选
    if (filterManager.length > 0) {
      if (!filterManager.includes(item.shopManager || "")) {
        return false;
      }
    }
    // 是否上传筛选
    if (filterUploaded === "yes" && item.uploadCount === 0) {
      return false;
    }
    if (filterUploaded === "no" && item.uploadCount > 0) {
      return false;
    }
    return true;
  });

  if (loading) {
    return <div className="text-center py-8 text-slate-500">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 筛选工具栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500">筛选:</span>
        <SearchSelect
          value={filterSite}
          onValueChange={setFilterSite as (value: string | string[]) => void}
          placeholder="全部站点"
          className="min-w-[120px]"
          maxDisplayItems={5}
          multiple
          showSelectAll
        >
          {availableSites.map((site) => (
            <SearchSelectItem key={site} value={site}>{site}</SearchSelectItem>
          ))}
        </SearchSelect>
        <SearchSelect
          value={filterPlatform}
          onValueChange={setFilterPlatform as (value: string | string[]) => void}
          placeholder="全部平台"
          className="min-w-[120px]"
          maxDisplayItems={5}
          multiple
          showSelectAll
        >
          {availablePlatforms.map((platform) => (
            <SearchSelectItem key={platform} value={platform}>{platform}</SearchSelectItem>
          ))}
        </SearchSelect>
        <SearchSelect
          value={filterManager}
          onValueChange={setFilterManager as (value: string | string[]) => void}
          placeholder="全部负责人"
          className="min-w-[120px]"
          maxDisplayItems={5}
          multiple
          showSelectAll
        >
          {availableManagers.map((manager) => (
            <SearchSelectItem key={manager} value={manager}>{manager}</SearchSelectItem>
          ))}
        </SearchSelect>
        <SearchSelect
          value={filterUploaded}
          onValueChange={(val) => setFilterUploaded(typeof val === 'string' ? val : '')}
          placeholder="是否上传"
          className="min-w-[120px]"
          showClearButton
        >
          <SearchSelectItem value="yes">已上传</SearchSelectItem>
          <SearchSelectItem value="no">未上传</SearchSelectItem>
        </SearchSelect>
        {(filterSite.length > 0 || filterPlatform.length > 0 || filterManager.length > 0 || filterUploaded) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterSite([]);
              setFilterPlatform([]);
              setFilterManager([]);
              setFilterUploaded("");
            }}
          >
            清除筛选
          </Button>
        )}
      </div>

      {filteredData.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          暂无收集进度数据。请确保已配置店铺的保存类型。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺名称</TableHead>
                <TableHead>站点</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>文件保存类型</TableHead>
                <TableHead>是否上传</TableHead>
                <TableHead>上传数量</TableHead>
                <TableHead>最后上传时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item, index) => (
                <TableRow key={`${item.shopId}_${item.exportType}_${index}`}>
                  <TableCell className="font-medium">{item.shopName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.shopSite}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.shopPlatform}</Badge>
                  </TableCell>
                  <TableCell>
                    {item.shopManager ? (
                      <span className="text-sm">{item.shopManager}</span>
                    ) : (
                      <span className="text-slate-400 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.uploadCount > 0 ? "default" : "secondary"}>
                      {item.exportType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.uploadCount > 0 ? (
                      <Badge variant="default" className="bg-green-500">已上传</Badge>
                    ) : (
                      <Badge variant="destructive">未上传</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{item.uploadCount}</TableCell>
                  <TableCell className="text-sm text-slate-500">{formatDate(item.lastUploadTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
