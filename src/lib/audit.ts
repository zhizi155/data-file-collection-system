import { getSupabaseClient } from '@/storage/database/supabase-client'

// 审计事件类型
export type AuditEventType =
  | 'auth.login'           // 登录
  | 'auth.login_failed'    // 登录失败
  | 'auth.logout'          // 登出
  | 'auth.password_change' // 修改密码
  | 'account.create'       // 创建账号
  | 'account.update'       // 更新账号
  | 'account.delete'       // 删除账号
  | 'file.upload'          // 上传文件
  | 'file.upload_new_version' // 上传新版本
  | 'file.download'        // 下载文件
  | 'file.export'          // 导出文件
  | 'file.delete'          // 删除文件（软删除）
  | 'file.restore'         // 恢复文件
  | 'file.permanent_delete' // 永久删除
  | 'rule.create'          // 创建规则
  | 'rule.update'          // 更新规则
  | 'rule.delete'          // 删除规则
  | 'shop.create'          // 创建店铺
  | 'shop.update'          // 更新店铺
  | 'shop.delete'          // 删除店铺
  | 'variable.create'      // 创建变量
  | 'variable.update'      // 更新变量
  | 'variable.delete'      // 删除变量

// 审计日志条目
export interface AuditLogEntry {
  event_type: AuditEventType
  user_id: string | null
  username: string | null
  ip_address: string | null
  user_agent: string | null
  target_type: string | null  // 目标类型（如 file, account, rule）
  target_id: string | null    // 目标 ID
  details: Record<string, unknown> | null  // 详细信息
  result: 'success' | 'failure'
  error_message: string | null
}

/**
 * 记录审计日志
 */
export async function logAuditEvent(entry: Omit<AuditLogEntry, 'created_at'>): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    await supabase.from('audit_logs').insert({
      event_type: entry.event_type,
      user_id: entry.user_id,
      username: entry.username,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      target_type: entry.target_type,
      target_id: entry.target_id,
      details: entry.details,
      result: entry.result,
      error_message: entry.error_message,
    })
  } catch (error) {
    // 审计日志记录失败不应影响业务
    console.error('审计日志记录失败:', error)
  }
}

/**
 * 从请求中提取 IP 地址
 */
export function extractIpAddress(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return null
}

/**
 * 从请求中提取 User-Agent
 */
export function extractUserAgent(request: Request): string | null {
  return request.headers.get('user-agent')
}

/**
 * 创建审计日志条目
 */
export function createAuditEntry(
  request: Request,
  eventType: AuditEventType,
  result: 'success' | 'failure',
  options: {
    userId?: string | null
    username?: string | null
    targetType?: string | null
    targetId?: string | null
    details?: Record<string, unknown> | null
    errorMessage?: string | null
  } = {}
): Omit<AuditLogEntry, 'created_at'> {
  return {
    event_type: eventType,
    user_id: options.userId || null,
    username: options.username || null,
    ip_address: extractIpAddress(request),
    user_agent: extractUserAgent(request),
    target_type: options.targetType || null,
    target_id: options.targetId || null,
    details: options.details || null,
    result,
    error_message: options.errorMessage || null,
  }
}

/**
 * 记录登录事件
 */
export async function logLogin(
  request: Request,
  userId: string,
  username: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await logAuditEvent(createAuditEntry(request, 'auth.login', success ? 'success' : 'failure', {
    userId: success ? userId : null,
    username,
    errorMessage,
  }))
}

/**
 * 记录文件上传事件
 */
export async function logFileUpload(
  request: Request,
  session: { userId: string; username: string },
  fileId: string,
  fileName: string,
  isNewVersion: boolean = false
): Promise<void> {
  await logAuditEvent(createAuditEntry(request, isNewVersion ? 'file.upload_new_version' : 'file.upload', 'success', {
    userId: session.userId,
    username: session.username,
    targetType: 'file',
    targetId: fileId,
    details: { fileName },
  }))
}

/**
 * 记录文件删除事件
 */
export async function logFileDelete(
  request: Request,
  session: { userId: string; username: string },
  fileId: string,
  isPermanent: boolean = false
): Promise<void> {
  await logAuditEvent(createAuditEntry(request, isPermanent ? 'file.permanent_delete' : 'file.delete', 'success', {
    userId: session.userId,
    username: session.username,
    targetType: 'file',
    targetId: fileId,
  }))
}

/**
 * 简化的审计日志记录函数
 */
export async function logAudit(
  supabase: any,
  entry: {
    eventType: AuditEventType;
    userId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, any>;
    result: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await supabase.from('audit_logs').insert({
    event_type: entry.eventType,
    user_id: entry.userId || null,
    username: entry.username || null,
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    details: entry.details || null,
    result: entry.result,
    error_message: entry.errorMessage || null
  })
}
