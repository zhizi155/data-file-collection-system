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
  shops?: {
    name: string;
    site: string;
    platform: string;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [variables, setVariables] = useState<CustomVariable[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("files");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [fileFilterShop, setFileFilterShop] = useState<string[]>([]);
  const [fileFilterPlatform, setFileFilterPlatform] = useState<string[]>([]);
  const [fileFilterSite, setFileFilterSite] = useState<string[]>([]);
  const [fileFilterDateRange, setFileFilterDateRange] = useState<string[]>([]);
  const [availableDateRanges, setAvailableDateRanges] = useState<string[]>([]); // 所有可用的日期区间
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string>("");

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
  const [shopForm, setShopForm] = useState({ name: "", site: "", platform: "", description: "", export_type: "" });
  const [shopSaving, setShopSaving] = useState(false);
  const [deleteShopId, setDeleteShopId] = useState<string | null>(null);
  const [shopDeleting, setShopDeleting] = useState(false);
  const [importingShops, setImportingShops] = useState(false);
  const [shopPreview, setShopPreview] = useState<{ site: string; platform: string; name: string; export_type?: string }[]>([]);
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
  const [accounts, setAccounts] = useState<Array<{
    id: string;
    username: string;
    role: string;
    display_name: string | null;
    is_active: boolean;
    last_login_at: string | null;
    login_count: number;
    created_at: string;
  }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [accountForm, setAccountForm] = useState({ username: "", password: "", display_name: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [accountDeleting, setAccountDeleting] = useState(false);

  // 用户角色信息
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string; display_name: string } | null>(null);
  const isMainAccount = currentUser?.role === "main";
  const isSubAccount = currentUser?.role === "sub";

  // 检查登录状态
  useEffect(() => {
    // 延迟检查，确保客户端已加载
    const checkLogin = () => {
      const loggedIn = localStorage.getItem("admin_auth_token");
      const loginTime = localStorage.getItem("admin_auth_time");
      const userStr = localStorage.getItem("admin_auth_user");

      if (!loggedIn || !loginTime) {
        router.push("/admin/login");
        return;
      }

      // 检查是否过期（7天）
      const elapsed = Date.now() - new Date(loginTime).getTime();
      const AUTH_TIMEOUT = 7 * 24 * 60 * 60 * 1000;
      if (elapsed > AUTH_TIMEOUT) {
        localStorage.removeItem("admin_auth_token");
        localStorage.removeItem("admin_auth_time");
        localStorage.removeItem("admin_auth_user");
        router.push("/admin/login");
        return;
      }

      // 解析用户信息
      if (userStr) {
        try {
          const userInfo = JSON.parse(userStr);
          setCurrentUser(userInfo);
        } catch (e) {
          console.error("解析用户信息失败", e);
        }
      }
    };

    const timer = setTimeout(checkLogin, 100);
    return () => clearTimeout(timer);
  }, [router]);

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
  const openAccountModal = (account?: any) => {
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

  const handleToggleAccount = async (account: any) => {
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

  // 加载文件记录
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      // 先获取所有日期区间选项（不带筛选条件）
      const allParams = new URLSearchParams();
      allParams.set("limit", "10000");
      const allRes = await fetch(`/api/files?${allParams.toString()}`);
      const allData = await allRes.json();
      if (allData.success && allData.data) {
        // 提取所有唯一的日期区间
        const dateRanges = [...new Set(
          allData.data
            .map((f: UploadedFile) => f.date_range)
            .filter(Boolean) as string[]
        )].sort();
        setAvailableDateRanges(dateRanges);
      }

      // 再获取筛选后的数据
      const params = new URLSearchParams();
      if (fileFilterShop.length > 0) params.set("shopId", fileFilterShop.join(","));
      if (fileFilterPlatform.length > 0) params.set("platform", fileFilterPlatform.join(","));
      if (fileFilterSite.length > 0) params.set("site", fileFilterSite.join(","));
      if (fileFilterDateRange.length > 0) params.set("dateRange", fileFilterDateRange.join(","));
      const queryString = params.toString();
      const url = queryString ? `/api/files?${queryString}` : "/api/files";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setFiles(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setFilesLoading(false);
    }
  }, [fileFilterShop, fileFilterPlatform, fileFilterSite, fileFilterDateRange]);

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
    if (selectedFiles.size === 0) {
      setError("请先选择要导出的文件");
      return;
    }

    const selectedFileData = files.filter((f) => selectedFiles.has(f.id));

    // 生成 CSV 内容
    const headers = ["序号", "原始文件名", "保存文件名", "店铺", "站点", "平台", "文件大小", "上传时间"];
    const rows = selectedFileData.map((f, idx) => [
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

  // 批量下载文件（服务端打包ZIP，保持目录结构：站点/平台/文件名）
  const batchDownloadFiles = async () => {
    if (selectedFiles.size === 0) {
      setError("请先选择要下载的文件");
      return;
    }

    try {
      setDownloading(true);
      setDownloadProgress(0);
      setDownloadStatus("正在打包文件...");

      // 调用服务端批量下载API
      const response = await fetch("/api/files/batch-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: Array.from(selectedFiles) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "打包失败");
        setDownloading(false);
        setDownloadStatus("");
        return;
      }

      setDownloadStatus("正在下载...");

      // 获取ZIP文件并触发下载
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `批量下载_${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadStatus("下载完成！");
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress(0);
        setDownloadStatus("");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "下载失败");
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus("");
    }
  };

  // 批量删除选中文件
  const batchDeleteFiles = async () => {
    if (selectedFiles.size === 0) {
      setError("请先选择要删除的文件");
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedFiles.size} 条记录吗？此操作不可撤销。`)) {
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
    if (!confirm("确定要删除这条记录吗？")) return;
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
      setShopForm({ name: shop.name, site: shop.site, platform: shop.platform, description: shop.description || "", export_type: shop.export_type || "" });
    } else {
      setEditingShop(null);
      setShopForm({ name: "", site: "", platform: "", description: "", export_type: "" });
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
          ? { id: editingShop.id, ...shopForm, export_type: shopForm.export_type || null } 
          : { ...shopForm, export_type: shopForm.export_type || null };
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

  const handleLogout = () => {
    localStorage.removeItem("admin_auth_token");
    localStorage.removeItem("admin_auth_time");
    localStorage.removeItem("admin_auth_user");
    router.push("/admin/login");
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
                  <div className="flex items-center gap-2">
                    <SearchSelect
                      value={fileFilterPlatform}
                      onValueChange={setFileFilterPlatform as (value: string | string[]) => void}
                      placeholder="全部平台"
                      className="min-w-[120px]"
                      maxDisplayItems={5}
                      multiple
                    >
                      {[...new Set(shops.map((s) => s.platform))].map((platform) => (
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
                    >
                      {[...new Set(shops.map((s) => s.site))].map((site) => (
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
                    >
                      {shops.map((shop) => (
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
                    >
                      {availableDateRanges.map((range) => (
                        <SearchSelectItem key={range} value={range}>
                          {range}
                        </SearchSelectItem>
                      ))}
                    </SearchSelect>
                    {/* 主账号可见的操作按钮 */}
                    {isMainAccount && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exportSelectedFiles}
                          disabled={selectedFiles.size === 0}
                          className="gap-2"
                        >
                          <Download className="w-4 h-4" />
                          导出上传记录 ({selectedFiles.size})
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={batchDownloadFiles}
                          disabled={selectedFiles.size === 0 || downloading}
                          className="gap-2"
                        >
                          {downloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FolderDown className="w-4 h-4" />
                          )}
                          {downloading ? "下载中..." : "批量下载"}
                          {selectedFiles.size > 0 && !downloading && ` (${selectedFiles.size})`}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={batchDeleteFiles}
                          disabled={selectedFiles.size === 0 || downloading}
                          className="gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          批量删除 {selectedFiles.size > 0 && `(${selectedFiles.size})`}
                    </Button>
                      </>
                    )}
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
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isMainAccount && (
                                  <>
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
                                )}
                                {isSubAccount && (
                                  <span className="text-xs text-slate-400">仅查看</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                                <p className="text-xs text-slate-400 mb-2">前三列：站点、平台、店铺名；D列为导出类型（可选）</p>
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
                              <TableCell colSpan={8} className="text-center py-8 text-slate-500">
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
    exportType: string;
    uploadCount: number;
    lastUploadTime: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  // 筛选状态
  const [filterSite, setFilterSite] = useState<string[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterUploaded, setFilterUploaded] = useState<string>(""); // "" | "yes" | "no"

  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    setLoading(true);
    try {
      // 获取所有店铺
      const shopsRes = await fetch("/api/shops?active=true");
      const shopsData = await shopsRes.json();
      
      // 获取所有上传记录
      const filesRes = await fetch("/api/files?limit=10000");
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
      }
    } catch (err) {
      console.error("加载收集进度失败:", err);
    } finally {
      setLoading(false);
    }
  };

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
        >
          {[...new Set(progressData.map((d) => d.shopSite))].map((site) => (
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
        >
          {[...new Set(progressData.map((d) => d.shopPlatform))].map((platform) => (
            <SearchSelectItem key={platform} value={platform}>{platform}</SearchSelectItem>
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
        {(filterSite.length > 0 || filterPlatform.length > 0 || filterUploaded) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterSite([]);
              setFilterPlatform([]);
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
