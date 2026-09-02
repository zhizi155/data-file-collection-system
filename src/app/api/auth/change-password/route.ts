import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/storage/database/supabase-client"
import { verifyPassword, hashPassword } from "@/lib/password"
import { getSessionFromRequest } from "@/lib/session"
import { requireAuth } from "@/lib/rbac"
import { logAuditEvent, createAuditEntry } from "@/lib/audit"

// 修改密码
export async function POST(request: NextRequest) {
  try {
    // 验证登录状态
    const authResult = await requireAuth(request)
    if (authResult.error) {
      return authResult.error
    }

    const session = authResult.session!
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "当前密码和新密码不能为空" },
        { status: 400 }
      )
    }

    // 密码长度检查
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "新密码长度不能少于6位" },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // 获取用户信息
    const { data: user, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", session.userId)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    // 验证当前密码
    const passwordToVerify = user.password_hash || user.password
    const { valid } = await verifyPassword(currentPassword, passwordToVerify)

    if (!valid) {
      await logAuditEvent(createAuditEntry(request, "auth.password_change", "failure", {
        userId: session.userId,
        username: session.username,
        errorMessage: "当前密码错误",
      }))
      return NextResponse.json(
        { error: "当前密码错误" },
        { status: 401 }
      )
    }

    // 检查新密码是否与当前密码相同
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "新密码不能与当前密码相同" },
        { status: 400 }
      )
    }

    // 哈希新密码
    const hashedPassword = await hashPassword(newPassword)

    // 更新密码
    const { error: updateError } = await supabase
      .from("admin_users")
      .update({
        password_hash: hashedPassword,
        password: "", // 清空明文密码
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.userId)

    if (updateError) {
      console.error("更新密码失败:", updateError)
      return NextResponse.json(
        { error: "修改密码失败" },
        { status: 500 }
      )
    }

    // 记录审计日志
    await logAuditEvent(createAuditEntry(request, "auth.password_change", "success", {
      userId: session.userId,
      username: session.username,
    }))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("修改密码失败:", error)
    return NextResponse.json(
      { error: "修改密码失败" },
      { status: 500 }
    )
  }
}
