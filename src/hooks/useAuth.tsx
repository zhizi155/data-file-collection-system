"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter } from "next/navigation"

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = "admin_auth_token"
const AUTH_TIME_KEY = "admin_auth_time"
const AUTH_TIMEOUT = 7 * 24 * 60 * 60 * 1000 // 7天

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // 检查登录状态
  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem(AUTH_STORAGE_KEY)
      const loginTime = localStorage.getItem(AUTH_TIME_KEY)
      
      if (!token || !loginTime) {
        return false
      }

      // 检查是否过期
      const elapsed = Date.now() - new Date(loginTime).getTime()
      if (elapsed > AUTH_TIMEOUT) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        localStorage.removeItem(AUTH_TIME_KEY)
        return false
      }

      // 验证 token 是否有效（可选：调用后端验证）
      // 这里我们直接信任 localStorage 的 token
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
      // 简单的客户端验证（生产环境应该用服务端验证）
      if (username === "admin" && password === "admin") {
        const token = `admin_token_${Date.now()}_${Math.random().toString(36).substring(2)}`
        localStorage.setItem(AUTH_STORAGE_KEY, token)
        localStorage.setItem(AUTH_TIME_KEY, new Date().toISOString())
        setIsAuthenticated(true)
        return { success: true }
      } else {
        return { success: false, error: "用户名或密码错误" }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "登录失败" }
    }
  }

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_TIME_KEY)
    setIsAuthenticated(false)
    router.push("/admin/login")
  }, [router])

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, checkAuth }}>
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

// 获取 token（供其他组件使用）
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(AUTH_STORAGE_KEY)
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
    localStorage.removeItem(AUTH_TIME_KEY)
    return false
  }
  return true
}
