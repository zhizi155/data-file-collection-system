"use client"

import { useEffect, useState, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { isLoggedIn } from "@/hooks/useAuth"

interface AuthGuardProps {
  children: ReactNode
  allowedRoles?: string[]
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)
  const [isAuth, setIsAuth] = useState(false)

  useEffect(() => {
    // 在客户端检查登录状态
    const checkAuth = () => {
      const loggedIn = isLoggedIn()
      setIsAuth(loggedIn)
      setIsChecking(false)

      if (!loggedIn && pathname.startsWith("/admin")) {
        // 清除旧的可能损坏的 key
        localStorage.removeItem("admin_logged_in")
        localStorage.removeItem("admin_login_time")
        
        // 只有不在登录页时才跳转
        if (pathname !== "/admin/login") {
          router.push("/admin/login")
        }
      }
    }

    // 延迟一下检查，确保 localStorage 已准备好
    const timer = setTimeout(checkAuth, 50)
    return () => clearTimeout(timer)
  }, [pathname, router])

  // 加载中或未登录（且不是登录页）
  if (isChecking) {
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
  if (!isAuth && pathname !== "/admin/login") {
    return null // 上面 useEffect 会处理跳转
  }

  return <>{children}</>
}

// Hook: 在组件中使用，保护页面
export function useAuthGuard(redirectToLogin = true) {
  const router = useRouter()
  const [isAuth, setIsAuth] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAuth = () => {
      const loggedIn = isLoggedIn()
      setIsAuth(loggedIn)
      
      if (!loggedIn && redirectToLogin) {
        router.push("/admin/login")
      }
    }

    const timer = setTimeout(checkAuth, 50)
    return () => clearTimeout(timer)
  }, [redirectToLogin, router])

  return isAuth
}
