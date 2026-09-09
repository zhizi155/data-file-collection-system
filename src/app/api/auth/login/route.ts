import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/storage/database/supabase-client"
import { verifyPassword, hashPassword, isPlainTextPassword } from "@/lib/password"
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session"
import { logAuditEvent, createAuditEntry, extractIpAddress, extractUserAgent } from "@/lib/audit"

// 登录限流配置
const MAX_LOGIN_ATTEMPTS = 5  // 最大尝试次数
const LOCKOUT_DURATION = 15 * 60 * 1000  // 锁定时间（15分钟）

// 检查是否被限流
async function checkLoginRateLimit(username: string, ipAddress: string): Promise<{ limited: boolean; remainingTime?: number }> {
  const supabase = getSupabaseClient()
  const since = new Date(Date.now() - LOCKOUT_DURATION).toISOString()

  // 检查该用户名和 IP 的失败次数
  const { data, error } = await supabase
    .from("login_attempts")
    .select("created_at")
    .eq("username", username)
    .eq("ip_address", ipAddress)
    .eq("success", false)
    .gte("created_at", since)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("检查登录限流失败:", error)
    return { limited: false }
  }

  if (data && data.length >= MAX_LOGIN_ATTEMPTS) {
    // 计算剩余锁定时间
    const oldestAttempt = new Date(data[0].created_at).getTime()
    const remainingTime = LOCKOUT_DURATION - (Date.now() - oldestAttempt)
    return { limited: true, remainingTime: Math.max(0, remainingTime) }
  }

  return { limited: false }
}

// 记录登录尝试
async function recordLoginAttempt(username: string, ipAddress: string, success: boolean): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.from("login_attempts").insert({
    username,
    ip_address: ipAddress,
    success,
  })
}

// 升级明文密码为哈希
async function upgradePasswordHash(userId: string, plainPassword: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    const hashedPassword = await hashPassword(plainPassword)
    const { error } = await supabase
      .from("admin_users")
      .update({ password_hash: hashedPassword, password: null })
      .eq("id", userId)
    if (error) {
      console.error("升级密码哈希失败:", error)
      return null
    }
    return hashedPassword
  } catch (error) {
    console.error("升级密码哈希失败:", error)
    return null
  }
}

// 管理员登录
export async function POST(request: NextRequest) {
  const ipAddress = extractIpAddress(request) || "unknown"
  const userAgent = extractUserAgent(request)

  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 })
    }

    // 检查限流
    const rateLimit = await checkLoginRateLimit(username, ipAddress)
    if (rateLimit.limited) {
      const remainingMinutes = Math.ceil((rateLimit.remainingTime || 0) / 60000)
      await logAuditEvent(createAuditEntry(request, "auth.login_failed", "failure", {
        username,
        errorMessage: `登录被限流，剩余 ${remainingMinutes} 分钟`,
      }))
      return NextResponse.json(
        { error: `登录尝试次数过多，请 ${remainingMinutes} 分钟后再试` },
        { status: 429 }
      )
    }

    const supabase = getSupabaseClient()

    // 查询账号
    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", username)
      .single()

    if (error || !data) {
      await recordLoginAttempt(username, ipAddress, false)
      await logAuditEvent(createAuditEntry(request, "auth.login_failed", "failure", {
        username,
        errorMessage: "用户名不存在",
      }))
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // 检查账号状态
    if (!data.is_active) {
      await recordLoginAttempt(username, ipAddress, false)
      await logAuditEvent(createAuditEntry(request, "auth.login_failed", "failure", {
        username,
        userId: data.id,
        errorMessage: "账号已被禁用",
      }))
      return NextResponse.json({ error: "账号已被禁用，请联系管理员" }, { status: 403 })
    }

    // 验证密码（优先使用哈希，兼容明文）
    const passwordToVerify = data.password_hash || data.password
    const { valid, needsUpgrade } = await verifyPassword(password, passwordToVerify)

    if (!valid) {
      await recordLoginAttempt(username, ipAddress, false)
      await logAuditEvent(createAuditEntry(request, "auth.login_failed", "failure", {
        username,
        userId: data.id,
        errorMessage: "密码错误",
      }))
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // 如果需要升级密码哈希
    let sessionSigningSecret = passwordToVerify
    if (needsUpgrade && isPlainTextPassword(passwordToVerify)) {
      const upgradedHash = await upgradePasswordHash(data.id, password)
      if (upgradedHash) sessionSigningSecret = upgradedHash
    }

    // 检查是否需要强制修改密码（弱默认密码）
    const mustChangePassword = data.must_change_password || 
      (data.username === "admin" && data.password === "admin") ||
      (isPlainTextPassword(passwordToVerify))

    // 更新登录信息
    await supabase
      .from("admin_users")
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (data.login_count || 0) + 1,
      })
      .eq("id", data.id)

    // 创建会话
    const token = await createSession(
      data.id,
      data.username,
      data.role,
      data.display_name || data.username,
      sessionSigningSecret,
    )

    // 记录成功登录
    await recordLoginAttempt(username, ipAddress, true)
    await logAuditEvent(createAuditEntry(request, "auth.login", "success", {
      userId: data.id,
      username: data.username,
    }))

    // 构建响应
    const response = NextResponse.json({
      success: true,
      role: data.role,
      user: {
        id: data.id,
        username: data.username,
        role: data.role,
        display_name: data.display_name,
        is_active: data.is_active,
      },
      mustChangePassword,
    })

    // 设置 HttpOnly Cookie
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("登录失败:", error)
    await logAuditEvent(createAuditEntry(request, "auth.login_failed", "failure", {
      errorMessage: error instanceof Error ? error.message : "未知错误",
    }))
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    )
  }
}
