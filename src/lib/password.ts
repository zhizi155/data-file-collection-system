import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/**
 * 哈希密码
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * 验证密码
 * 支持 bcrypt 哈希和明文密码（兼容旧数据）
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  // 检查是否是 bcrypt 哈希（以 $2a$ 或 $2b$ 开头）
  const isBcryptHash = /^\$2[ab]\$\d{2}\$/.test(hashedPassword)

  if (isBcryptHash) {
    // 使用 bcrypt 验证
    const valid = await bcrypt.compare(password, hashedPassword)
    return { valid, needsUpgrade: false }
  } else {
    // 明文密码比较（兼容旧数据）
    const valid = password === hashedPassword
    return { valid, needsUpgrade: valid } // 如果验证通过，需要升级
  }
}

/**
 * 检查密码是否为明文格式
 */
export function isPlainTextPassword(password: string): boolean {
  return !/^\$2[ab]\$\d{2}\$/.test(password)
}
