import type { CollectionNote } from "@/lib/collection-notes";

export interface CollectionProgressShop {
  id: string;
  name: string;
  site: string;
  platform: string;
  manager: string | null;
  export_type: string | null;
}

export interface CollectionProgressFile {
  id?: string;
  shop_id: string | null;
  export_type: string | null;
  created_at: string;
}

export interface CollectionProgressRow {
  shopId: string;
  shopName: string;
  shopSite: string;
  shopPlatform: string;
  shopManager: string | null;
  exportType: string;
  uploadCount: number;
  lastUploadTime: string | null;
  specialNote: string | null;
  noteUpdatedAt: string | null;
}

interface UploadSummary {
  uploadCount: number;
  lastUploadTime: string;
}

function progressKey(shopId: string, exportType: string): string {
  return JSON.stringify([shopId, exportType]);
}

export function buildCollectionProgress(
  shops: CollectionProgressShop[],
  files: CollectionProgressFile[],
  notes: CollectionNote[],
): CollectionProgressRow[] {
  const summaries = new Map<string, UploadSummary>();
  const notesByKey = new Map(notes.map((note) => [
    progressKey(note.shopId, note.exportType),
    note,
  ]));

  for (const file of files) {
    if (!file.shop_id || !file.export_type) continue;
    const key = progressKey(file.shop_id, file.export_type);
    const existing = summaries.get(key);
    if (!existing) {
      summaries.set(key, { uploadCount: 1, lastUploadTime: file.created_at });
      continue;
    }

    existing.uploadCount += 1;
    if (file.created_at > existing.lastUploadTime) existing.lastUploadTime = file.created_at;
  }

  return shops.flatMap((shop) => {
    const exportTypes = [...new Set(
      (shop.export_type ?? "")
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean),
    )];

    return exportTypes.map((exportType) => {
      const key = progressKey(shop.id, exportType);
      const summary = summaries.get(key);
      const note = notesByKey.get(key);
      return {
        shopId: shop.id,
        shopName: shop.name,
        shopSite: shop.site,
        shopPlatform: shop.platform,
        shopManager: shop.manager,
        exportType,
        uploadCount: summary?.uploadCount ?? 0,
        lastUploadTime: summary?.lastUploadTime ?? null,
        specialNote: note?.note ?? null,
        noteUpdatedAt: note?.updatedAt ?? null,
      };
    });
  }).sort((a, b) => {
    const shopComparison = a.shopName.localeCompare(b.shopName, "zh-CN");
    return shopComparison !== 0
      ? shopComparison
      : a.exportType.localeCompare(b.exportType, "zh-CN");
  });
}
