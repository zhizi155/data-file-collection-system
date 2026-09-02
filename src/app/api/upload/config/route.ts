import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { DEFAULT_UPLOAD_POLICY, mergeUploadPolicy } from "@/lib/upload-policy";

export async function GET() {
  try {
    const { data, error } = await getSupabaseClient()
      .from("upload_config")
      .select("key, value");
    const policy = error ? DEFAULT_UPLOAD_POLICY : mergeUploadPolicy(data ?? []);
    return NextResponse.json({ success: true, data: policy });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT_UPLOAD_POLICY });
  }
}
