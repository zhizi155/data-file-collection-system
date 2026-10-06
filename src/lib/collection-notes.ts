import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const COLLECTION_NOTE_PREFIX = "__collection_note__:";

export interface CollectionNote {
  shopId: string;
  exportType: string;
  note: string;
  updatedAt: string | null;
}

interface CollectionNoteMetadata {
  kind: "collection-note";
  shopId: string;
  exportType: string;
}

interface CollectionNoteRow {
  name: string;
  value: string;
  description: string | null;
  updated_at: string | null;
}

export function createCollectionNoteKey(shopId: string, exportType: string): string {
  const digest = createHash("sha256")
    .update(`${shopId}\u0000${exportType}`, "utf8")
    .digest("hex");
  return `${COLLECTION_NOTE_PREFIX}${digest}`;
}

export function createCollectionNoteMetadata(shopId: string, exportType: string): string {
  return JSON.stringify({
    kind: "collection-note",
    shopId,
    exportType,
  } satisfies CollectionNoteMetadata);
}

export function parseCollectionNote(row: CollectionNoteRow): CollectionNote | null {
  if (!row.name.startsWith(COLLECTION_NOTE_PREFIX) || !row.description) return null;

  try {
    const metadata = JSON.parse(row.description) as Partial<CollectionNoteMetadata>;
    if (
      metadata.kind !== "collection-note"
      || typeof metadata.shopId !== "string"
      || !metadata.shopId
      || typeof metadata.exportType !== "string"
      || !metadata.exportType
      || typeof row.value !== "string"
      || !row.value.trim()
    ) {
      return null;
    }

    return {
      shopId: metadata.shopId,
      exportType: metadata.exportType,
      note: row.value.trim(),
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function loadCollectionNotes(supabase: SupabaseClient): Promise<CollectionNote[]> {
  const { data, error } = await supabase
    .from("custom_variables")
    .select("name, value, description, updated_at")
    .like("name", `${COLLECTION_NOTE_PREFIX}%`)
    .eq("is_active", true);

  if (error) throw error;
  return ((data ?? []) as CollectionNoteRow[])
    .map(parseCollectionNote)
    .filter((note): note is CollectionNote => note !== null);
}

export async function clearCollectionNote(
  supabase: SupabaseClient,
  shopId: string,
  exportType: string,
): Promise<void> {
  const { error } = await supabase
    .from("custom_variables")
    .delete()
    .eq("name", createCollectionNoteKey(shopId, exportType));
  if (error) throw error;
}
