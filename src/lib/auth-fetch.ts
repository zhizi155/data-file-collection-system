// 认证相关的 API 请求工具

const AUTH_TOKEN_KEY = "admin_auth_token"

/**
 * 获取认证 token
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

/**
 * 检查是否已登录
 */
export function isAuthenticated(): boolean {
  const token = getAuthToken()
  if (!token) return false
  
  const loginTime = localStorage.getItem("admin_auth_time")
  if (!loginTime) return false
  
  // 检查是否过期（7天）
  const elapsed = Date.now() - new Date(loginTime).getTime()
  const AUTH_TIMEOUT = 7 * 24 * 60 * 60 * 1000
  if (elapsed > AUTH_TIMEOUT) {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem("admin_auth_time")
    return false
  }
  
  return true
}

/**
 * 带认证的 fetch 请求
 * 自动添加 Authorization 头和 credentials
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken()
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  
  // 添加认证 token
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  
  // 确保 credentials 包含 cookie
  const credentials = (options.credentials as RequestCredentials) || "include"
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials,
  })
  
  return response
}

/**
 * 带认证的 JSON 请求
 */
export async function authJsonFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  }
  
  const response = await authFetch(url, {
    ...options,
    headers,
  })
  
  const contentType = response.headers.get("content-type")
  if (contentType && contentType.includes("application/json")) {
    return await response.json()
  }
  
  return { success: false, error: "Invalid response" }
}
