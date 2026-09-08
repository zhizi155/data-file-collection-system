"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter } from "next/navigation"

interface UserInfo {
  id: string
  username: string
  role: "main" | "sub_admin" | "sub"
  display_name: string
  is_active: boolean
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  role: "main" | "sub_admin" | "sub" | null
  user: UserInfo | null
  mustChangePassword: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>
  logout: () => Promise<void>
  checkSession: () => Promise<boolean>
  isMainAccount: boolean
  isSubAdmin: boolean
  isSubAccount: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [role, setRole] = useState<"main" | "sub_admin" | "sub" | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const router = useRouter()

  // 检查会话状态
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "include", // 包含 Cookie
      })

      if (!res.ok) {
        setIsAuthenticated(false)
        setRole(null)
        setUser(null)
        return false
      }

      const data = await res.json()

      if (data.authenticated && data.user) {
        setRole(data.user.role)
        setUser({
          id: data.user.id,
          username: data.user.username,
          role: data.user.role,
          display_name: data.user.displayName,
          is_active: true,
        })
        setIsAuthenticated(true)
        return true
      }

      setIsAuthenticated(false)
      setRole(null)
      setUser(null)
      return false
    } catch {
      setIsAuthenticated(false)
      setRole(null)
      setUser(null)
      return false
    }
  }, [])

  // 初始化检查登录状态
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true)
      await checkSession()
      setIsLoading(false)
    }
    initAuth()
  }, [checkSession])

  // 登录
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 包含 Cookie
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "登录失败" }
      }

      // 设置用户信息
      const userInfo: UserInfo = {
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        display_name: data.user.display_name,
        is_active: data.user.is_active,
      }

      setRole(userInfo.role)
      setUser(userInfo)
      setIsAuthenticated(true)
      setMustChangePassword(data.mustChangePassword || false)

      return { 
        success: true, 
        mustChangePassword: data.mustChangePassword || false 
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "登录失败" }
    }
  }

  // 登出
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // 忽略登出错误
    }

    setIsAuthenticated(false)
    setRole(null)
    setUser(null)
    setMustChangePassword(false)
    router.push("/admin/login")
  }, [router])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        role,
        user,
        mustChangePassword,
        login,
        logout,
        checkSession,
        isMainAccount: role === "main",
        isSubAdmin: role === "sub_admin",
        isSubAccount: role === "sub",
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
