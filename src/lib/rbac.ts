import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, SessionData } from './session'

// 权限定义
export type Permission =
  | 'account:manage'      // 账号管理
  | 'rules:manage'        // 命名规则管理
  | 'files:delete'        // 删除文件
  | 'files:restore'       // 恢复文件
  | 'files:export'        // 导出文件
  | 'files:view'          // 查看文件
  | 'files:update'        // 修正文件元数据
  | 'shops:manage'        // 店铺管理
  | 'variables:manage'    // 变量管理
  | 'audit:view'          // 查看审计日志

// 角色权限映射
const ROLE_PERMISSIONS: Record<'main' | 'sub', Permission[]> = {
  main: [
    'account:manage',
    'rules:manage',
    'files:delete',
    'files:restore',
    'files:export',
    'files:view',
    'files:update',
    'shops:manage',
    'variables:manage',
    'audit:view',
  ],
  sub: [
    'files:export',
    'files:view',
  ],
}

/**
 * 检查用户是否有权限
 */
export function hasPermission(session: SessionData, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[session.role] || []
  return permissions.includes(permission)
}

/**
 * 检查用户是否有所有指定权限
 */
export function hasAllPermissions(session: SessionData, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(session, p))
}

/**
 * 检查用户是否有任一指定权限
 */
export function hasAnyPermission(session: SessionData, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(session, p))
}

/**
 * 获取用户的所有权限
 */
export function getUserPermissions(session: SessionData): Permission[] {
  return ROLE_PERMISSIONS[session.role] || []
}

/**
 * 认证中间件 - 要求登录
 */
export async function requireAuth(request: NextRequest): Promise<{ session: SessionData | null; error?: NextResponse }> {
  const session = await getSessionFromRequest(request)

  if (!session) {
    return {
      session: null,
      error: NextResponse.json(
        { error: '未登录或登录已过期，请重新登录' },
        { status: 401 }
      ),
    }
  }

  return { session }
}

/**
 * 权限中间件 - 要求特定权限
 */
export async function requirePermission(
  request: NextRequest,
  permission: Permission
): Promise<{ session: SessionData | null; error?: NextResponse }> {
  const authResult = await requireAuth(request)

  if (authResult.error) {
    return authResult
  }

  const session = authResult.session!

  if (!hasPermission(session, permission)) {
    return {
      session,
      error: NextResponse.json(
        { error: '权限不足，无法执行此操作' },
        { status: 403 }
      ),
    }
  }

  return { session }
}

/**
 * 多权限中间件 - 要求所有指定权限
 */
export async function requireAllPermissions(
  request: NextRequest,
  permissions: Permission[]
): Promise<{ session: SessionData | null; error?: NextResponse }> {
  const authResult = await requireAuth(request)

  if (authResult.error) {
    return authResult
  }

  const session = authResult.session!

  if (!hasAllPermissions(session, permissions)) {
    return {
      session,
      error: NextResponse.json(
        { error: '权限不足，无法执行此操作' },
        { status: 403 }
      ),
    }
  }

  return { session }
}

/**
 * 多权限中间件 - 要求任一指定权限
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: Permission[]
): Promise<{ session: SessionData | null; error?: NextResponse }> {
  const authResult = await requireAuth(request)

  if (authResult.error) {
    return authResult
  }

  const session = authResult.session!

  if (!hasAnyPermission(session, permissions)) {
    return {
      session,
      error: NextResponse.json(
        { error: '权限不足，无法执行此操作' },
        { status: 403 }
      ),
    }
  }

  return { session }
}
