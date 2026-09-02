import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/storage/database/supabase-client"

// 获取所有管理员账号
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get("active") === "true"

    const supabase = getSupabaseClient()
    let query = supabase
      .from("admin_users")
      .select("id, username, role, display_name, is_active, created_at, last_login_at, login_count")
      .order("created_at", { ascending: false })

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    )
  }
}

// 创建管理员账号
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, display_name, role = "sub" } = body

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 })
    }

    if (!["main", "sub", "sub_admin"].includes(role)) {
      return NextResponse.json({ error: "无效的角色类型" }, { status: 400 })
    }

    // 简单密码验证（实际生产环境应使用更严格的验证）
    if (password.length < 4) {
      return NextResponse.json({ error: "密码长度至少4位" }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    // 检查用户名是否已存在
    const { data: existing } = await supabase
      .from("admin_users")
      .select("id")
      .eq("username", username)
      .single()

    if (existing) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 400 })
    }

    // 创建账号（密码使用简单存储，内部系统足够）
    const { data, error } = await supabase
      .from("admin_users")
      .insert({
        username,
        password, // 简单存储
        role,
        display_name: display_name || username,
        is_active: true,
      })
      .select("id, username, role, display_name, is_active, created_at")
      .single()

    if (error) {
      return NextResponse.json({ error: `创建失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    )
  }
}

// 更新管理员账号
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, password, display_name, is_active } = body

    if (!id) {
      return NextResponse.json({ error: "缺少账号ID" }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    // 获取原账号信息
    const { data: existing, error: getError } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", id)
      .single()

    if (getError || !existing) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 })
    }

    // 子账号不能修改为主账号角色
    if (existing.role === "sub" && body.role === "main") {
      return NextResponse.json({ error: "无权修改为主账号" }, { status: 403 })
    }

    const updateData: Record<string, any> = {}
    if (password) {
      if (password.length < 4) {
        return NextResponse.json({ error: "密码长度至少4位" }, { status: 400 })
      }
      updateData.password = password
    }
    if (display_name !== undefined) updateData.display_name = display_name
    if (is_active !== undefined) updateData.is_active = is_active
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("admin_users")
      .update(updateData)
      .eq("id", id)
      .select("id, username, role, display_name, is_active, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 }
    )
  }
}

// 删除管理员账号
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "缺少账号ID" }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    // 检查是否为最后一个主账号
    const { data: account } = await supabase
      .from("admin_users")
      .select("role")
      .eq("id", id)
      .single()

    if (!account) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 })
    }

    if (account.role === "main") {
      // 检查是否还有其他主账号
      const { count } = await supabase
        .from("admin_users")
        .select("*", { count: "exact", head: true })
        .eq("role", "main")
        .eq("is_active", true)

      if ((count || 0) <= 1) {
        return NextResponse.json({ error: "不能删除最后一个主账号" }, { status: 400 })
      }
    }

    const { error } = await supabase
      .from("admin_users")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: `删除失败: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    )
  }
}
