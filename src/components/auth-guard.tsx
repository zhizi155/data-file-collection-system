"use client"

import { useEffect, useState, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"

interface AuthGuardProps {
  children: ReactNode
  allowedRoles?: string[]
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading, role } = useAuth()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!isLoading) {
      setIsChecking(false)

      // 检查角色权限
      if (isAuthenticated && allowedRoles && allowedRoles.length > 0) {
        if (role && !allowedRoles.includes(role)) {
          // 角色不匹配，跳转到首页或显示无权限
          router.push("/admin")
        }
      }

      // 未登录且不在登录页
      if (!isAuthenticated && !pathname.startsWith("/admin/login")) {
        router.push("/admin/login")
      }
    }
  }, [isLoading, isAuthenticated, role, allowedRoles, pathname, router])

  // 加载中
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-4"></div>
          <p className="text-slate-500">检查登录状态...</p>
        </div>
      </div>
    )
  }

  // 未登录且不在登录页
  if (!isAuthenticated && !pathname.startsWith("/admin/login")) {
    return null // 上面 useEffect 会处理跳转
  }

  return <>{children}</>
}

// Hook: 在组件中使用，保护页面
export function useAuthGuard(redirectToLogin = true) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated && redirectToLogin) {
      router.push("/admin/login")
    }
  }, [isLoading, isAuthenticated, redirectToLogin, router])

  return isAuthenticated
}
