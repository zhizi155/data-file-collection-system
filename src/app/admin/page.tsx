"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Edit2,
  Trash2,
  Settings,
  LogOut,
  X,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";
import { Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NamingRule {
  id: string;
  name: string;
  pattern: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NamingRule | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    pattern: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 检查登录状态
  useEffect(() => {
    const loggedIn = localStorage.getItem("admin_logged_in");
    if (!loggedIn) {
      router.push("/admin/login");
    }
  }, [router]);

  // 加载规则列表
  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 打开新增/编辑模态框
  const openModal = (rule?: NamingRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        pattern: rule.pattern,
        description: rule.description || "",
      });
    } else {
      setEditingRule(null);
      setFormData({ name: "", pattern: "{original}", description: "" });
    }
    setModalOpen(true);
  };

  // 保存规则
  const handleSave = async () => {
    if (!formData.name || !formData.pattern) {
      setError("请填写名称和规则");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = editingRule ? "/api/rules" : "/api/rules";
      const method = editingRule ? "PUT" : "POST";
      const body = editingRule
        ? { id: editingRule.id, ...formData }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setModalOpen(false);
        loadRules();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 切换启用状态
  const handleToggleActive = async (rule: NamingRule) => {
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          is_active: !rule.is_active,
        }),
      });

      const data = await res.json();
      if (data.success) {
        loadRules();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  };

  // 删除规则
  const handleDelete = async () => {
    if (!deleteId) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rules?id=${deleteId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (data.success) {
        setDeleteId(null);
        loadRules();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem("admin_logged_in");
    localStorage.removeItem("admin_login_time");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* 头部 */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              文件收集系统 - 管理后台
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mr-4"
            >
              返回上传页
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  命名规则管理
                </CardTitle>
                <CardDescription>
                  配置文件上传时的命名规则，支持变量替换
                </CardDescription>
              </div>
              <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => openModal()}>
                    <Plus className="w-4 h-4 mr-2" />
                    新增规则
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {editingRule ? "编辑规则" : "新增规则"}
                    </DialogTitle>
                    <DialogDescription>
                      {editingRule
                        ? "修改命名规则配置"
                        : "创建一个新的命名规则"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">规则名称</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="例如: 日期-时间格式"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pattern">命名模式</Label>
                      <Input
                        id="pattern"
                        value={formData.pattern}
                        onChange={(e) =>
                          setFormData({ ...formData, pattern: e.target.value })
                        }
                        placeholder="{date}_{time}_{original}"
                      />
                      <p className="text-xs text-slate-500">
                        支持变量: {"{original}"} {"{date}"} {"{time}"} {"{datetime}"} {"{random}"} {"{timestamp}"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">描述说明</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        placeholder="规则的用途说明..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setModalOpen(false)}
                    >
                      取消
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-slate-500">
                加载中...
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                暂无命名规则，点击上方按钮添加
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>规则名称</TableHead>
                    <TableHead>命名模式</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {rule.pattern}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {rule.description || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => handleToggleActive(rule)}
                          />
                          <span
                            className={`text-xs ${
                              rule.is_active
                                ? "text-green-600"
                                : "text-slate-400"
                            }`}
                          >
                            {rule.is_active ? "启用" : "禁用"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(rule.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openModal(rule)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                          </Tooltip>
                          <Dialog
                            open={deleteId === rule.id}
                            onOpenChange={(open) =>
                              !open && setDeleteId(null)
                            }
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteId(rule.id)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>确认删除</DialogTitle>
                                <DialogDescription>
                                  确定要删除规则 &quot;{rule.name}&quot; 吗？此操作无法撤销。
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={handleDelete}
                                  disabled={deleting}
                                >
                                  {deleting ? "删除中..." : "删除"}
                                </Button>
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

        {/* 变量说明卡片 */}
        <Card className="mt-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">变量说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{original}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  原始文件名（不含扩展名）
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{date}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  当前日期 (YYYY-MM-DD)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{time}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  当前时间 (HHMMSS)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{datetime}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  日期时间 (完整格式)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{random}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  8位随机字符
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400">
                  {"{timestamp}"}
                </code>
                <span className="text-slate-600 dark:text-slate-400">
                  时间戳（毫秒）
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
