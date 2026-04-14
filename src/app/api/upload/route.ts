import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 应用命名规则生成文件名
async function applyNamingPattern(
  pattern: string,
  originalName: string,
  shopId?: string,
  exportType?: string
): Promise<string> {
  const now = new Date();
  const ext = originalName.split(".").pop() || "";
  const nameWithoutExt = originalName.replace(/\.[^.]+$/, "");

  // 默认变量
  const replacements: Record<string, string> = {
    "{original}": nameWithoutExt,
    "{date}": now.toISOString().split("T")[0],
    "{time}": now.toTimeString().split(" ")[0].replace(/:/g, ""),
    "{datetime}": now.toISOString().replace(/[:-]/g, "").split(".")[0],
    "{random}": Math.random().toString(36).substring(2, 10),
    "{timestamp}": now.getTime().toString(),
    "{export_type}": exportType || "",
  };

  // 从数据库获取店铺信息
  if (shopId) {
    const supabase = getSupabaseClient();
    const { data: shop } = await supabase
      .from("shops")
      .select("name, site, platform")
      .eq("id", shopId)
      .maybeSingle();

    if (shop) {
      replacements["{shop_name}"] = shop.name;
      replacements["{shop_site}"] = shop.site;
      replacements["{shop_platform}"] = shop.platform;
      replacements["{shop}"] = shop.name;
      // 如果没有传入exportType，使用店铺的export_type
      if (!exportType && shop.export_type) {
        replacements["{export_type}"] = shop.export_type;
      }
    }
  }

  // 从数据库获取自定义变量
  const supabase = getSupabaseClient();
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

  // 确保有扩展名
  if (ext && !newName.endsWith(`.${ext}`)) {
    newName = `${newName}.${ext}`;
  }

  // 清理非法字符
  newName = newName.replace(/[?#&%{}^[\]`\\< >~|":']/g, "_").replace(/[+]/g, "-");

  return newName;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const ruleId = formData.get("ruleId") as string | null;
    const shopId = formData.get("shopId") as string | null;
    const exportType = formData.get("exportType") as string | null;

    if (!file) {
      return NextResponse.json({ error: "没有上传文件" }, { status: 400 });
    }

    // 获取命名规则
    const supabase = getSupabaseClient();
    let pattern = "{original}";

    if (ruleId) {
      const { data: rule, error } = await supabase
        .from("naming_rules")
        .select("pattern")
        .eq("id", ruleId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: `查询命名规则失败: ${error.message}` }, { status: 500 });
      }

      if (rule) {
        pattern = rule.pattern;
      }
    } else {
      // 获取默认命名规则
      const { data: rules, error } = await supabase
        .from("naming_rules")
        .select("id, pattern")
        .eq("is_active", true)
        .order("created_at")
        .limit(1);

      if (error) {
        return NextResponse.json({ error: `查询命名规则失败: ${error.message}` }, { status: 500 });
      }

      if (rules && rules.length > 0) {
        pattern = rules[0].pattern;
      }
    }

    // 应用命名规则（包含店铺和自定义变量）
    const newFileName = await applyNamingPattern(pattern, file.name, shopId || undefined, exportType || undefined);

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `uploads/${newFileName}`,
      contentType: file.type || "application/octet-stream",
    });

    // 记录到数据库
    const { error: insertError } = await supabase.from("uploaded_files").insert({
      original_name: file.name,
      stored_key: fileKey,
      file_size: file.size.toString(),
      mime_type: file.type,
      rule_id: ruleId || null,
      shop_id: shopId || null,
      export_type: exportType || null,
    });

    if (insertError) {
      console.error("记录上传文件失败:", insertError);
    }

    // 生成访问链接
    const fileUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400 * 7,
    });

    return NextResponse.json({
      success: true,
      originalName: file.name,
      newName: newFileName,
      fileKey: fileKey,
      fileUrl: fileUrl,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("上传文件失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    );
  }
}
