import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 会话配置
export const SESSION_COOKIE_NAME = 'session_token'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7天（秒）
export const SESSION_REFRESH_THRESHOLD = 24 * 60 * 60 // 1天内刷新（秒）

// 会话数据结构
export interface SessionData {
  userId: string
  username: string
  role: 'main' | 'sub'
  displayName: string
  iat: number // 签发时间
  exp: number // 过期时间
}

/**
 * 生成安全的会话令牌
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * 创建会话
 */
export async function createSession(userId: string, username: string, role: 'main' | 'sub', displayName: string): Promise<string> {
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
  await supabase.from('sessions').insert({
    token,
    user_id: userId,
    data: sessionData,
    expires_at: new Date(sessionData.exp * 1000).toISOString(),
  })

  return token
}

/**
 * 验证会话
 */
export async function validateSession(token: string): Promise<SessionData | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('data, expires_at')
    .eq('token', token)
    .single()

  if (error || !data) {
    return null
  }

  // 检查是否过期
  const expiresAt = new Date(data.expires_at).getTime()
  if (Date.now() > expiresAt) {
    // 删除过期会话
    await supabase.from('sessions').delete().eq('token', token)
    return null
  }

  return data.data as SessionData
}

/**
 * 刷新会话（滑动过期）
 */
export async function refreshSession(token: string): Promise<void> {
  const supabase = getSupabaseClient()

  const { data } = await supabase
    .from('sessions')
    .select('data, expires_at')
    .eq('token', token)
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
      .eq('token', token)
  }
}

/**
 * 删除会话
 */
export async function deleteSession(token: string): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.from('sessions').delete().eq('token', token)
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
