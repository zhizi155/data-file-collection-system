import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 获取命名后的文件名
async function getNamingPattern(
  fileName: string,
  shopId?: string,
  exportType?: string
): Promise<string> {
  const supabase = getSupabaseClient();
  let pattern = "{original}";

  // 获取默认命名规则
  const { data: rules } = await supabase
    .from("naming_rules")
    .select("pattern")
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  if (rules && rules.length > 0) {
    pattern = rules[0].pattern;
  }

  const now = new Date();
  const ext = fileName.split(".").pop() || "";
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  const replacements: Record<string, string> = {
    "{original}": nameWithoutExt,
    "{date}": now.toISOString().split("T")[0],
    "{time}": now.toTimeString().split(" ")[0].replace(/:/g, ""),
    "{datetime}": now.toISOString().replace(/[:-]/g, "").split(".")[0],
    "{random}": Math.random().toString(36).substring(2, 10),
    "{timestamp}": now.getTime().toString(),
    "{export_type}": exportType || "",
  };

  // 店铺变量
  if (shopId) {
    const { data: shop } = await supabase
      .from("shops")
      .select("name, site, platform, export_type")
      .eq("id", shopId)
      .maybeSingle();

    if (shop) {
      replacements["{shop_name}"] = shop.name;
      replacements["{shop_site}"] = shop.site;
      replacements["{shop_platform}"] = shop.platform;
      replacements["{shop}"] = shop.name;
      if (!exportType && shop.export_type) {
        replacements["{export_type}"] = shop.export_type;
      }
    }
  }

  // 自定义变量
  const { data: variables } = await supabase
    .from("custom_variables")
    .select("name, value")
    .eq("is_active", true);

  if (variables) {
    for (const v of variables) {
      replacements[v.name] = v.value;
    }
  }

  let newName = pattern;
  for (const [key, value] of Object.entries(replacements)) {
    const escapedKey = key.replace(/[{}]/g, "\\$&");
    newName = newName.replace(new RegExp(escapedKey, "g"), value);
  }

  if (ext && !newName.endsWith(`.${ext}`)) {
    newName = `${newName}.${ext}`;
  }

  return newName.replace(/[?#&%{}^[\]`\\< >~|":']/g, "_").replace(/[+]/g, "-");
}

// 获取预签名上传URL（用于大文件直接上传到S3）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileSize, shopId, exportType } = body;

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "缺少文件名或文件大小" },
        { status: 400 }
      );
    }

    // 获取命名后的文件名
    const newFileName = await getNamingPattern(fileName, shopId, exportType);
    const objectKey = `uploads/${newFileName}`;

    // 生成预签名URL用于上传
    const presignedUrl = await storage.generatePresignedUrl({
      key: objectKey,
      expireTime: 3600, // 1小时有效期
    });

    // 生成下载用的预签名URL
    const downloadUrl = await storage.generatePresignedUrl({
      key: objectKey,
      expireTime: 86400 * 7,
    });

    return NextResponse.json({
      success: true,
      uploadUrl: presignedUrl,
      downloadUrl: downloadUrl,
      objectKey: objectKey,
      newFileName: newFileName,
      // contentType is intentionally excluded as it's only used for documentation
    });
  } catch (error) {
    console.error("生成预签名URL失败:", error);
    return NextResponse.json(
      { error: "生成上传链接失败" },
      { status: 500 }
    );
  }
}
