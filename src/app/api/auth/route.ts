import { NextRequest, NextResponse } from "next/server"

// 验证登录状态并设置 cookie
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, token } = body

    if (action === "check") {
      // 检查 token 是否有效
      // 在实际生产环境中，应该在服务端验证 token
      return NextResponse.json({ success: true, authenticated: true })
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "验证失败" },
      { status: 500 }
    )
  }
}

// 获取当前登录状态
export async function GET(request: NextRequest) {
  // 检查 cookie 中的登录状态
  const cookies = request.cookies
  const authCookie = cookies.get("admin_auth")

  if (authCookie) {
    return NextResponse.json({ success: true, authenticated: true })
  }

  return NextResponse.json({ success: true, authenticated: false })
}
