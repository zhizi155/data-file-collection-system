import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { requirePermission } from "@/lib/rbac";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "files:view");
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "缺少文件key" }, { status: 400 });
    }

    // 生成签名 URL 并重定向
    const signedUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 3600, // 1小时有效期
    });

    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("生成下载链接失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成下载链接失败" },
      { status: 500 }
    );
  }
}
