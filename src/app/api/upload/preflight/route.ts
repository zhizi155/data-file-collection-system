import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy, validateUploadCandidate } from "@/lib/upload-policy";

interface PreflightBody {
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  shopId?: string;
  exportType?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PreflightBody;
    const supabase = getSupabaseClient();
    const { data: configRows } = await supabase.from("upload_config").select("key, value");
    const policy = configRows ? mergeUploadPolicy(configRows) : DEFAULT_UPLOAD_POLICY;
    const errors = validateUploadCandidate({
      fileName: body.fileName ?? "",
      fileSize: Number(body.fileSize),
      contentType: body.contentType || "application/octet-stream",
    }, policy);

    if (!body.shopId) errors.push("请选择店铺");
    const { data: shop } = body.shopId
      ? await supabase.from("shops").select("id, export_type, is_active").eq("id", body.shopId).maybeSingle()
      : { data: null };
    if (!shop || !shop.is_active) errors.push("店铺不存在或已停用");
    const exportTypes = String(shop?.export_type ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (exportTypes.length > 0 && !body.exportType) errors.push("请选择文件保存类型");
    if (body.exportType && exportTypes.length > 0 && !exportTypes.includes(body.exportType)) {
      errors.push("文件保存类型不属于该店铺");
    }
    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors, policy }, { status: 400 });
    }

    let duplicateQuery = supabase
      .from("uploaded_files")
      .select("id, original_name, display_name, version, created_at")
      .eq("shop_id", body.shopId!)
      .eq("is_current", true)
      .eq("is_deleted", false);
    duplicateQuery = body.exportType
      ? duplicateQuery.eq("export_type", body.exportType)
      : duplicateQuery.eq("original_name", body.fileName!);
    const { data: duplicate } = await duplicateQuery.maybeSingle();

    return NextResponse.json({
      success: true,
      policy,
      duplicate: duplicate ? {
        id: duplicate.id,
        name: duplicate.display_name || duplicate.original_name,
        version: duplicate.version || 1,
        createdAt: duplicate.created_at,
      } : null,
    });
  } catch {
    return NextResponse.json({ error: "上传预检失败" }, { status: 500 });
  }
}
