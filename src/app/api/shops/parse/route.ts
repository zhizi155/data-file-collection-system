import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "shops:manage");
  if (auth.error) return auth.error;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "没有上传文件" }, { status: 400 });
    }

    // 检查文件类型
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json({ error: "只支持 Excel 文件 (.xlsx, .xls)" }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Excel 文件中没有工作表" }, { status: 400 });
    }

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<{ 站点?: string; 平台?: string; 店铺名?: string; Site?: string; Platform?: string; "Store Name"?: string; 导出类型?: string; "Export Type"?: string; 负责人?: string; Manager?: string }>(worksheet, { header: 1 });

    if (data.length < 2) {
      return NextResponse.json({ error: "Excel 文件至少需要包含标题行和数据行" }, { status: 400 });
    }

    // 解析表头和数据
    const headers = data[0] as string[];
    const headerMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      if (typeof h === "string") {
        headerMap[h.trim()] = idx;
      }
    });

    // 支持中英文表头
    const siteIndex = headerMap["站点"] ?? headerMap["Site"] ?? headerMap["site"] ?? -1;
    const platformIndex = headerMap["平台"] ?? headerMap["Platform"] ?? headerMap["platform"] ?? -1;
    const nameIndex = headerMap["店铺名"] ?? headerMap["店铺名称"] ?? headerMap["Store Name"] ?? headerMap["name"] ?? -1;
    const exportTypeIndex = headerMap["导出类型"] ?? headerMap["Export Type"] ?? headerMap["export_type"] ?? -1;
    const managerIndex = headerMap["负责人"] ?? headerMap["Manager"] ?? -1;

    if (siteIndex === -1 || platformIndex === -1 || nameIndex === -1) {
      return NextResponse.json(
        { error: "Excel 文件必须包含：站点、平台、店铺名（前三列），D列为导出类型（可选），E列为负责人（可选）" },
        { status: 400 }
      );
    }

    // 解析数据行
    const shops: { site: string; platform: string; name: string; export_type?: string; manager?: string }[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number | undefined)[];
      const site = String(row[siteIndex] ?? "").trim();
      const platform = String(row[platformIndex] ?? "").trim();
      const name = String(row[nameIndex] ?? "").trim();
      const exportType = exportTypeIndex !== -1 ? String(row[exportTypeIndex] ?? "").trim() : undefined;
      const manager = managerIndex !== -1 ? String(row[managerIndex] ?? "").trim() : undefined;

      if (site && platform && name) {
        const shop: { site: string; platform: string; name: string; export_type?: string; manager?: string } = { site, platform, name };
        if (exportType) {
          shop.export_type = exportType;
        }
        if (manager) {
          shop.manager = manager;
        }
        shops.push(shop);
      }
    }

    if (shops.length === 0) {
      return NextResponse.json({ error: "未找到有效数据" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      shops,
      total: shops.length,
      fileName: file.name,
    });
  } catch (error) {
    console.error("解析 Excel 文件失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 500 }
    );
  }
}
