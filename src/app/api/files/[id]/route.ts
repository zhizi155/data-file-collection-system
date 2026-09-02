import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

// 软删除文件（移到回收站）
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!hasPermission(user, 'files:delete')) {
    return NextResponse.json({ error: "无删除权限" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids')?.split(',').filter(Boolean);
    const permanent = searchParams.get('permanent') === 'true';

    if (!id && (!ids || ids.length === 0)) {
      return NextResponse.json(
        { error: "缺少文件ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const fileIds = id ? [id] : ids!;

    if (permanent) {
      // 永久删除（仅主账号）
      if (user.role !== 'main') {
        return NextResponse.json(
          { error: "仅主账号可永久删除" },
          { status: 403 }
        );
      }

      // 获取文件信息用于清理存储
      const { data: files } = await supabase
        .from('uploaded_files')
        .select('id, stored_key, original_name')
        .in('id', fileIds);

      // 删除存储对象
      if (files && files.length > 0) {
        const { S3Storage } = await import('coze-coding-dev-sdk');
        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: "",
          secretKey: "",
          bucketName: process.env.COZE_BUCKET_NAME,
          region: "cn-beijing",
        });

        for (const file of files) {
          try {
            await storage.deleteFile({ fileKey: file.stored_key });
          } catch (err) {
            console.warn("删除存储对象失败:", err);
          }
        }
      }

      // 从数据库删除
      const { error } = await supabase
        .from('uploaded_files')
        .delete()
        .in('id', fileIds);

      if (error) {
        return NextResponse.json(
          { error: "删除失败" },
          { status: 500 }
        );
      }

      // 记录审计日志
      await logAudit(supabase, {
        eventType: 'file.permanent_delete',
        userId: user.userId,
        username: user.username,
        targetType: 'file',
        targetId: fileIds.join(','),
        details: {
          fileCount: fileIds.length,
          permanent: true
        },
        result: 'success'
      });

      return NextResponse.json({
        success: true,
        message: "永久删除成功",
        deletedCount: fileIds.length
      });
    } else {
      // 软删除（移到回收站）
      const { error } = await supabase
        .from('uploaded_files')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.userId
        })
        .in('id', fileIds);

      if (error) {
        return NextResponse.json(
          { error: "删除失败" },
          { status: 500 }
        );
      }

      // 记录审计日志
      await logAudit(supabase, {
        eventType: 'file.delete',
        userId: user.userId,
        username: user.username,
        targetType: 'file',
        targetId: fileIds.join(','),
        details: {
          fileCount: fileIds.length,
          permanent: false
        },
        result: 'success'
      });

      return NextResponse.json({
        success: true,
        message: "已移到回收站",
        deletedCount: fileIds.length
      });
    }
  } catch (error) {
    console.error("删除文件失败:", error);
    return NextResponse.json(
      { error: "删除失败" },
      { status: 500 }
    );
  }
}

// 恢复已删除的文件
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!hasPermission(user, 'files:delete')) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "缺少文件ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 恢复文件
    const { error } = await supabase
      .from('uploaded_files')
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      })
      .in('id', ids)
      .eq('is_deleted', true);

    if (error) {
      return NextResponse.json(
        { error: "恢复失败" },
        { status: 500 }
      );
    }

    // 记录审计日志
    await logAudit(supabase, {
      eventType: 'file.restore',
      userId: user.userId,
      username: user.username,
      targetType: 'file',
      targetId: ids.join(','),
      details: { fileCount: ids.length },
      result: 'success'
    });

    return NextResponse.json({
      success: true,
      message: "恢复成功",
      restoredCount: ids.length
    });
  } catch (error) {
    console.error("恢复文件失败:", error);
    return NextResponse.json(
      { error: "恢复失败" },
      { status: 500 }
    );
  }
}
