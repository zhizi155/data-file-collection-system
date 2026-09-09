import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, validateUploadCandidate } from "@/lib/upload-policy";

// 创建S3客户端用于生成PUT预签名URL
function createS3Client() {
  return new S3Client({
    region: "cn-beijing",
    endpoint: process.env.COZE_BUCKET_ENDPOINT_URL,
    credentials: {
      accessKeyId: "",
      secretAccessKey: "",
    },
  });
}

// 获取命名后的文件名
async function getNamingPattern(
  fileName: string,
  shopId?: string,
  exportType?: string
): Promise<string> {
  const supabase = getSupabaseClient();
  let pattern = "{original}";

  // 根据 exportType 查找对应规则
  if (exportType) {
    // 优先查找匹配的规则（检查是否包含该类型）
    const { data: rules } = await supabase
      .from("naming_rules")
      .select("pattern, export_type")
      .eq("is_active", true)
      .not("export_type", "is", null);

    // 找到 export_type 包含当前类型的规则
    const matchedRule = rules?.find((r: { export_type: string }) => {
      if (!r.export_type) return false;
      const types = r.export_type.split(",").map((t: string) => t.trim());
      return types.includes(exportType);
    });

    if (matchedRule) {
      pattern = matchedRule.pattern;
    } else {
      // 没有匹配的，使用通用规则
      const { data: genericRules } = await supabase
        .from("naming_rules")
        .select("pattern")
        .is("export_type", null)
        .eq("is_active", true)
        .limit(1);

      if (genericRules && genericRules.length > 0) {
        pattern = genericRules[0].pattern;
      }
    }
  } else {
    // 没有指定类型，使用通用规则
    const { data: rules } = await supabase
      .from("naming_rules")
      .select("pattern")
      .is("export_type", null)
      .eq("is_active", true)
      .order("created_at")
      .limit(1);

    if (rules && rules.length > 0) {
      pattern = rules[0].pattern;
    }
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

  // 如果生成的名称为空、只有点、或只有空白字符，fallback 到原始文件名（不含扩展名）
  const newNameWithoutExt = newName.replace(/\.[^.]+$/, "");
  if (!newNameWithoutExt.trim()) {
    newName = nameWithoutExt;
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

    const supabase = getSupabaseClient();
    const { data: configRows } = await supabase.from("upload_config").select("key, value");
    const policy = configRows ? mergeUploadPolicy(configRows) : DEFAULT_UPLOAD_POLICY;
    const contentType = body.contentType || "application/octet-stream";
    const validationErrors = validateUploadCandidate({ fileName, fileSize: Number(fileSize), contentType }, policy);
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join("；") }, { status: 400 });
    }

    // 每次上传都使用不可变 key，避免新版本覆盖历史对象。
    const newFileName = await getNamingPattern(fileName, shopId, exportType);
    const safeShop = String(shopId || "unassigned").replace(/[^a-zA-Z0-9_-]/g, "_");
    const objectKey = `uploads/${safeShop}/${Date.now()}_${crypto.randomUUID()}_${newFileName}`;

    const s3Client = createS3Client();
    const displayName = exportType
      ? `${exportType}${fileName.includes(".") ? `.${fileName.split(".").pop()}` : ""}`
      : newFileName;

    if (Number(fileSize) > policy.largeFileThreshold) {
      const createResult = await s3Client.send(new CreateMultipartUploadCommand({
        Bucket: process.env.COZE_BUCKET_NAME,
        Key: objectKey,
        ContentType: contentType,
      }));
      if (!createResult.UploadId) throw new Error("对象存储未返回 multipart uploadId");
      const totalParts = Math.ceil(Number(fileSize) / policy.multipartPartSize);
      if (totalParts > 10_000) {
        return NextResponse.json({ error: "文件分片数量超过对象存储限制" }, { status: 400 });
      }
      const parts = await Promise.all(Array.from({ length: totalParts }, async (_, index) => {
        const partNumber = index + 1;
        const uploadUrl = await getSignedUrl(s3Client, new UploadPartCommand({
          Bucket: process.env.COZE_BUCKET_NAME,
          Key: objectKey,
          UploadId: createResult.UploadId,
          PartNumber: partNumber,
        }), { expiresIn: 3600 });
        return { partNumber, uploadUrl };
      }));
      return NextResponse.json({
        success: true,
        uploadMode: "multipart",
        uploadId: createResult.UploadId,
        objectKey,
        newFileName: displayName,
        partSize: policy.multipartPartSize,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        parts,
      });
    }

    const command = new PutObjectCommand({
      Bucket: process.env.COZE_BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    });
    
    // 生成PUT预签名URL（用于直接上传到S3）
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1小时
    });

    return NextResponse.json({
      success: true,
      uploadMode: "single",
      uploadUrl,
      objectKey,
      newFileName: displayName,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
  } catch (error) {
    console.error("生成预签名URL失败:", error);
    return NextResponse.json(
      { error: "生成上传链接失败" },
      { status: 500 }
    );
  }
}
