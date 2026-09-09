import { NextResponse } from "next/server";

/** 新上传流程全部使用预签名 URL，避免文件内容经过应用网关。 */
export async function POST() {
  return NextResponse.json({
    error: "旧版网关上传接口已停用，请刷新页面后重试",
    preflight: "/api/upload/preflight",
    presign: "/api/upload/presign",
  }, { status: 410 });
}
