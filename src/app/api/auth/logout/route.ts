import { NextRequest, NextResponse } from "next/server"
import { deleteSession, SESSION_COOKIE_NAME, getSessionFromRequest } from "@/lib/session"
import { logAuditEvent, createAuditEntry } from "@/lib/audit"

// 管理员登出
export async function POST(request: NextRequest) {
  try {
    // 获取当前会话
    const session = await getSessionFromRequest(request)

    if (session) {
      // 记录登出事件
      await logAuditEvent(createAuditEntry(request, "auth.logout", "success", {
        userId: session.userId,
        username: session.username,
      }))

      // 删除会话
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
      if (token) {
        await deleteSession(token)
      }
    }

    // 构建响应
    const response = NextResponse.json({ success: true })

    // 清除 Cookie
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("登出失败:", error)
    return NextResponse.json(
      { error: "登出失败" },
      { status: 500 }
    )
  }
}

// GET 方法也支持登出（兼容旧代码）
export async function GET(request: NextRequest) {
  return POST(request)
}
