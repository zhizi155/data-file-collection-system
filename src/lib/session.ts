import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import {
  createSignedSessionToken,
  isSignedSessionToken,
  readSignedSessionPayload,
  SessionData,
  verifySignedSessionToken,
} from '@/lib/session-token'

export type { SessionData } from '@/lib/session-token'

// 会话配置
export const SESSION_COOKIE_NAME = 'session_token'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7天（秒）
export const SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 // 1天内刷新（秒）

/**
 * 生成安全的会话令牌
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * 创建会话
 */
export async function createSession(
  userId: string,
  username: string,
  role: 'main' | 'sub_admin' | 'sub',
  displayName: string,
  signingSecret: string,
): Promise<string> {
  const token = generateSessionToken()
  const now = Math.floor(Date.now() / 1000)

  const sessionData: SessionData = {
    userId,
    username,
    role,
    displayName,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  }

  // 存储到数据库
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('sessions').insert({
    token: hashSessionToken(token),
    user_id: userId,
    data: sessionData,
    expires_at: new Date(sessionData.exp * 1000).toISOString(),
  })

  if (!error) return token

  // 兼容尚未创建 sessions 表的旧项目。签名密钥来自账号密码哈希，
  // 每次验证仍会重新读取账号状态，因此禁用账号或修改密码会立即失效。
  console.warn('数据库会话不可用，使用签名会话兼容模式:', error.message)
  return createSignedSessionToken(sessionData, signingSecret)
}

async function validateSignedSession(token: string): Promise<SessionData | null> {
  const payload = readSignedSessionPayload(token)
  if (!payload) return null

  const supabase = getSupabaseClient()
  let { data, error } = await supabase
    .from('admin_users')
    .select('id, username, role, display_name, is_active, password_hash, password')
    .eq('id', payload.userId)
    .maybeSingle()

  // 极旧表可能还没有 password_hash 字段。
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const legacy = await supabase
      .from('admin_users')
      .select('id, username, role, display_name, is_active, password')
      .eq('id', payload.userId)
      .maybeSingle()
    data = legacy.data ? { ...legacy.data, password_hash: null } : null
    error = legacy.error
  }

  if (error || !data || !data.is_active) return null
  const secret = data.password_hash || data.password
  const verified = secret ? verifySignedSessionToken(token, secret) : null
  if (!verified) return null

  if (!['main', 'sub_admin', 'sub'].includes(data.role)) return null
  return {
    ...verified,
    username: data.username,
    role: data.role,
    displayName: data.display_name || data.username,
  }
}

/**
 * 验证会话
 */
export async function validateSession(token: string): Promise<SessionData | null> {
  if (isSignedSessionToken(token)) return validateSignedSession(token)

  const supabase = getSupabaseClient()
  const tokenHash = hashSessionToken(token)
  let { data, error } = await supabase
    .from('sessions')
    .select('data, expires_at')
    .eq('token', tokenHash)
    .maybeSingle()

  // 兼容旧版明文 token，并在首次使用时原位升级。
  if (!data) {
    const legacy = await supabase
      .from('sessions')
      .select('data, expires_at')
      .eq('token', token)
      .maybeSingle()
    data = legacy.data
    error = legacy.error
    if (data) await supabase.from('sessions').update({ token: tokenHash }).eq('token', token)
  }

  if (error || !data) {
    return null
  }

  // 检查是否过期
  const expiresAt = new Date(data.expires_at).getTime()
  if (Date.now() > expiresAt) {
    // 删除过期会话
    await supabase.from('sessions').delete().eq('token', tokenHash)
    return null
  }

  return data.data as SessionData
}

/**
 * 刷新会话（滑动过期）
 */
export async function refreshSession(token: string): Promise<void> {
  if (isSignedSessionToken(token)) return

  const supabase = getSupabaseClient()
  const tokenHash = hashSessionToken(token)

  const { data } = await supabase
    .from('sessions')
    .select('data, expires_at')
    .eq('token', tokenHash)
    .single()

  if (!data) return

  const expiresAt = new Date(data.expires_at).getTime()
  const now = Date.now()
  const timeUntilExpiry = expiresAt - now

  // 如果距离过期时间小于阈值，刷新会话
  if (timeUntilExpiry < SESSION_REFRESH_THRESHOLD * 1000) {
    const sessionData = data.data as SessionData
    const newExp = Math.floor(now / 1000) + SESSION_MAX_AGE

    sessionData.exp = newExp

    await supabase
      .from('sessions')
      .update({
        data: sessionData,
        expires_at: new Date(newExp * 1000).toISOString(),
      })
      .eq('token', tokenHash)
  }
}

/**
 * 删除会话
 */
export async function deleteSession(token: string): Promise<void> {
  if (isSignedSessionToken(token)) return

  const supabase = getSupabaseClient()
  await supabase.from('sessions').delete().in('token', [hashSessionToken(token), token])
}

/**
 * 删除用户的所有会话
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.from('sessions').delete().eq('user_id', userId)
}

/**
 * 清理过期会话
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = getSupabaseClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', now)
    .select()

  if (error) {
    console.error('清理过期会话失败:', error)
    return 0
  }

  return data?.length || 0
}

/**
 * 从请求中获取会话
 */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await validateSession(token)
  if (session) {
    // 异步刷新会话（不阻塞响应）
    refreshSession(token).catch(console.error)
  }

  return session
}

/**
 * 设置会话 Cookie
 */
export function setSessionCookie(token: string, maxAge: number = SESSION_MAX_AGE): string {
  const cookieValue = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  return cookieValue
}

/**
 * 清除会话 Cookie
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

/**
 * 获取当前用户（从 Cookie 中获取会话）
 */
export async function getSessionUser(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await validateSession(token)
  if (session) {
    // 异步刷新会话（不阻塞响应）
    refreshSession(token).catch(console.error)
  }

  return session
}
