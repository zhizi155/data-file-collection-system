import { NextResponse } from "next/server";

/**
 * 旧版接口会把分片写入 /tmp 后合并，在多实例和无服务器环境中并不可靠。
 * 新版客户端使用 /api/upload/presign 的对象存储 multipart 直传。
 */
export async function POST() {
  return NextResponse.json({
    error: "该分片接口已停用，请刷新页面后使用对象存储直传",
    replacement: "/api/upload/presign",
  }, { status: 410 });
}
