import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/storage/database/supabase-client"

// 管理员登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    // 查询账号
    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", username)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // 检查账号状态
    if (!data.is_active) {
      return NextResponse.json({ error: "账号已被禁用，请联系管理员" }, { status: 403 })
    }

    // 验证密码
    if (data.password !== password) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 })
    }

    // 更新登录信息
    await supabase
      .from("admin_users")
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (data.login_count || 0) + 1,
      })
      .eq("id", data.id)

    // 生成 token
    const token = `admin_token_${data.id}_${Date.now()}_${Math.random().toString(36).substring(2)}`

    // 返回登录信息（不返回密码）
    const { password: _, ...safeData } = data

    return NextResponse.json({
      success: true,
      token,
      role: data.role,
      user: safeData,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "登录失败" },
      { status: 500 }
    )
  }
}
