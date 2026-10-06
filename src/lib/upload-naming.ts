import { getSupabaseClient } from "@/storage/database/supabase-client";
import { COLLECTION_NOTE_PREFIX } from "@/lib/collection-notes";

export async function getUploadName(
  fileName: string,
  shopId?: string,
  exportType?: string,
): Promise<string> {
  const supabase = getSupabaseClient();
  let pattern = "{original}";

  if (exportType) {
    const { data: rules } = await supabase
      .from("naming_rules")
      .select("pattern, export_type")
      .eq("is_active", true)
      .not("export_type", "is", null);
    const matchedRule = rules?.find((rule: { export_type: string | null }) => {
      const types = String(rule.export_type || "")
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean);
      return types.includes(exportType);
    });

    if (matchedRule) {
      pattern = matchedRule.pattern;
    } else {
      const { data: genericRules } = await supabase
        .from("naming_rules")
        .select("pattern")
        .is("export_type", null)
        .eq("is_active", true)
        .limit(1);
      if (genericRules?.length) pattern = genericRules[0].pattern;
    }
  } else {
    const { data: rules } = await supabase
      .from("naming_rules")
      .select("pattern")
      .is("export_type", null)
      .eq("is_active", true)
      .order("created_at")
      .limit(1);
    if (rules?.length) pattern = rules[0].pattern;
  }

  const now = new Date();
  const lastDot = fileName.lastIndexOf(".");
  const extension = lastDot > 0 ? fileName.slice(lastDot + 1) : "";
  const nameWithoutExtension = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const replacements: Record<string, string> = {
    "{original}": nameWithoutExtension,
    "{date}": now.toISOString().split("T")[0],
    "{time}": now.toTimeString().split(" ")[0].replace(/:/g, ""),
    "{datetime}": now.toISOString().replace(/[:-]/g, "").split(".")[0],
    "{random}": Math.random().toString(36).substring(2, 10),
    "{timestamp}": now.getTime().toString(),
    "{export_type}": exportType || "",
  };

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
      if (!exportType && shop.export_type) replacements["{export_type}"] = shop.export_type;
    }
  }

  const { data: variables } = await supabase
    .from("custom_variables")
    .select("name, value")
    .eq("is_active", true)
    .not("name", "like", `${COLLECTION_NOTE_PREFIX}%`);
  for (const variable of variables ?? []) replacements[variable.name] = variable.value;

  let newName = pattern;
  for (const [key, value] of Object.entries(replacements)) {
    const escapedKey = key.replace(/[{}]/g, "\\$&");
    newName = newName.replace(new RegExp(escapedKey, "g"), value);
  }
  if (!newName.replace(/\.[^.]+$/, "").trim()) newName = nameWithoutExtension;
  if (extension && !newName.endsWith(`.${extension}`)) newName = `${newName}.${extension}`;

  return newName
    .replace(/[/?#&%{}^[\]`\\<>~|":']/g, "_")
    .replace(/ /g, "_")
    .replace(/[+]/g, "-");
}

export function getUploadDisplayName(originalName: string, generatedName: string, exportType?: string): string {
  const lastDot = originalName.lastIndexOf(".");
  const extension = lastDot > 0 ? originalName.slice(lastDot + 1) : "";
  return exportType ? `${exportType}${extension ? `.${extension}` : ""}` : generatedName;
}
