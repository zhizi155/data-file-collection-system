import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, refreshSession, SESSION_COOKIE_NAME } from "@/lib/session"

// 验证会话状态
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return NextResponse.json(
        { authenticated: false, error: "未登录或登录已过期" },
        { status: 401 }
      )
    }

    // 刷新会话
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    if (token) {
      await refreshSession(token)
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        role: session.role,
        displayName: session.displayName,
      },
    })
  } catch (error) {
    console.error("验证会话失败:", error)
    return NextResponse.json(
      { authenticated: false, error: "验证失败" },
      { status: 500 }
    )
  }
}
