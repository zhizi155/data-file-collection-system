"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter } from "next/navigation"

interface UserInfo {
  id: string
  username: string
  role: "main" | "sub" | "sub_admin"
  display_name: string
  is_active: boolean
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  role: "main" | "sub" | "sub_admin" | null
  user: UserInfo | null
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isMainAccount: boolean
  isSubAccount: boolean
  isSubAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = "admin_auth_token"
const AUTH_USER_KEY = "admin_auth_user"
const AUTH_TIME_KEY = "admin_auth_time"
const AUTH_TIMEOUT = 7 * 24 * 60 * 60 * 1000 // 7天

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [role, setRole] = useState<"main" | "sub" | "sub_admin" | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const router = useRouter()

  // 检查登录状态
  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem(AUTH_STORAGE_KEY)
      const userStr = localStorage.getItem(AUTH_USER_KEY)
      const loginTime = localStorage.getItem(AUTH_TIME_KEY)

      if (!token || !loginTime || !userStr) {
        return false
      }

      // 检查是否过期
      const elapsed = Date.now() - new Date(loginTime).getTime()
      if (elapsed > AUTH_TIMEOUT) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        localStorage.removeItem(AUTH_USER_KEY)
        localStorage.removeItem(AUTH_TIME_KEY)
        return false
      }

      // 解析用户信息
      const userInfo = JSON.parse(userStr)
      setRole(userInfo.role)
      setUser(userInfo)
      return true
    } catch {
      return false
    }
  }, [])

  // 初始化检查登录状态
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true)
      const valid = await checkAuth()
      setIsAuthenticated(valid)
      setIsLoading(false)
    }
    initAuth()
  }, [checkAuth])

  // 登录
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "登录失败" }
      }

      // 保存登录信息
      const token = data.token
      const userInfo: UserInfo = {
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        display_name: data.user.display_name,
        is_active: data.user.is_active,
      }

      localStorage.setItem(AUTH_STORAGE_KEY, token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userInfo))
      localStorage.setItem(AUTH_TIME_KEY, new Date().toISOString())

      setRole(userInfo.role)
      setUser(userInfo)
      setIsAuthenticated(true)

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "登录失败" }
    }
  }

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_TIME_KEY)
    setIsAuthenticated(false)
    setRole(null)
    setUser(null)
    router.push("/admin/login")
  }, [router])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        role,
        user,
        login,
        logout,
        isMainAccount: role === "main",
        isSubAccount: role === "sub",
        isSubAdmin: role === "sub_admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

// 获取当前用户信息
export function getCurrentUser(): UserInfo | null {
  if (typeof window === "undefined") return null
  try {
    const userStr = localStorage.getItem(AUTH_USER_KEY)
    if (!userStr) return null
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

// 检查是否为主账号
export function isMainAccount(): boolean {
  const user = getCurrentUser()
  return user?.role === "main"
}

// 检查是否已登录
export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false
  const token = localStorage.getItem(AUTH_STORAGE_KEY)
  const loginTime = localStorage.getItem(AUTH_TIME_KEY)
  if (!token || !loginTime) return false

  const elapsed = Date.now() - new Date(loginTime).getTime()
  if (elapsed > AUTH_TIMEOUT) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_TIME_KEY)
    return false
  }
  return true
}
