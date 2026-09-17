import { NextResponse } from "next/server";

/**
 * 旧版接口会把分片写入 /tmp 后合并，在多实例和无服务器环境中并不可靠。
 * 新版客户端使用 /api/upload/presign 创建任务，并由 /api/upload/part 同域转发分片。
 */
export async function POST() {
  return NextResponse.json({
    error: "该分片接口已停用，请刷新页面后使用新版分片上传",
    replacement: "/api/upload/part",
  }, { status: 410 });
}
