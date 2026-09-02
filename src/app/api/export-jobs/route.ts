import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getSessionUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

// 创建导出任务
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!hasPermission(user, 'files:export')) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fileIds, filterParams, includeHistory } = body;

    const supabase = getSupabaseClient();

    // 创建导出任务
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .insert({
        user_id: user.userId,
        status: 'pending',
        file_count: fileIds?.length || 0,
        filter_params: filterParams || null,
        file_ids: fileIds || null
      })
      .select()
      .single();

    if (jobError) {
      console.error("创建导出任务失败:", jobError);
      return NextResponse.json(
        { error: "创建导出任务失败" },
        { status: 500 }
      );
    }

    // 记录审计日志
    await logAudit(supabase, {
      eventType: 'file.export',
      userId: user.userId,
      username: user.username,
      targetType: 'export_job',
      targetId: job.id,
      details: {
        fileCount: fileIds?.length || 0,
        includeHistory: includeHistory || false
      },
      result: 'success'
    });

    // 异步处理导出（在实际环境中应该使用队列）
    // 这里简化处理，直接开始处理
    processExportJob(job.id).catch(err => {
      console.error("导出任务处理失败:", err);
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status
    });
  } catch (error) {
    console.error("创建导出任务失败:", error);
    return NextResponse.json(
      { error: "创建导出任务失败" },
      { status: 500 }
    );
  }
}

// 获取导出任务列表
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');

  const { data: jobs, error } = await supabase
    .from('export_jobs')
    .select('*')
    .eq('user_id', user.userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "获取导出任务失败" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: jobs
  });
}

// 处理导出任务
async function processExportJob(jobId: string) {
  const supabase = getSupabaseClient();
  
  try {
    // 更新状态为处理中
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // 获取任务信息
    const { data: job } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) {
      throw new Error("任务不存在");
    }

    // 获取文件列表
    let files;
    if (job.file_ids && job.file_ids.length > 0) {
      // 按 ID 查询（分批）
      files = [];
      const batchSize = 100;
      for (let i = 0; i < job.file_ids.length; i += batchSize) {
        const batch = job.file_ids.slice(i, i + batchSize);
        const { data } = await supabase
          .from('uploaded_files')
          .select('*')
          .in('id', batch)
          .eq('is_deleted', false);
        if (data) {
          files.push(...data);
        }
      }
    } else if (job.filter_params) {
      // 按筛选条件查询
      const { data } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('is_deleted', false)
        .eq('is_current', true);
      files = data;
    } else {
      throw new Error("没有文件可导出");
    }

    if (!files || files.length === 0) {
      throw new Error("没有文件可导出");
    }

    // 更新文件数量
    await supabase
      .from('export_jobs')
      .update({ file_count: files.length })
      .eq('id', jobId);

    // 生成 ZIP 文件
    const { S3Storage } = await import('coze-coding-dev-sdk');
    const archiver = (await import('archiver')).default;
    
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });

    // 创建 ZIP
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];
    
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    // 添加文件到 ZIP
    let processedCount = 0;
    let failedCount = 0;
    const failedFiles: string[] = [];

    for (const file of files) {
      try {
        // 下载文件
        const fileData = await storage.readFile({ fileKey: file.stored_key });
        
        // 处理文件名（避免非法字符和重名）
        let fileName = file.display_name || file.original_name;
        fileName = fileName.replace(/[<>:"|?*]/g, '_');
        
        // 添加版本号
        if (file.version && file.version > 1) {
          const ext = fileName.split('.').pop();
          const baseName = fileName.replace(/\.[^/.]+$/, '');
          fileName = `${baseName}_v${file.version}.${ext}`;
        }
        
        archive.append(fileData, { name: fileName });
        processedCount++;
      } catch (err) {
        failedCount++;
        failedFiles.push(file.display_name || file.original_name);
      }

      // 更新进度
      if (processedCount % 10 === 0) {
        await supabase
          .from('export_jobs')
          .update({ 
            processed_count: processedCount,
            failed_count: failedCount
          })
          .eq('id', jobId);
      }
    }

    // 完成 ZIP
    archive.finalize();
    await new Promise(resolve => archive.on('end', resolve));

    // 上传 ZIP
    const zipBuffer = Buffer.concat(chunks);
    const zipKey = `exports/${jobId}_${Date.now()}.zip`;
    
    await storage.uploadFile({
      fileContent: zipBuffer,
      fileName: zipKey,
      contentType: 'application/zip'
    });

    // 生成预签名 URL
    const resultUrl = await storage.generatePresignedUrl({
      key: zipKey,
      expireTime: 86400 // 24小时
    });

    // 更新任务状态
    await supabase
      .from('export_jobs')
      .update({
        status: 'completed',
        processed_count: processedCount,
        failed_count: failedCount,
        result_key: zipKey,
        result_url: resultUrl,
        result_expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // 记录审计日志
    await logAudit(supabase, {
      eventType: 'file.export',
      userId: job.user_id,
      targetType: 'export_job',
      targetId: jobId,
      details: {
        processedCount,
        failedCount,
        failedFiles: failedFiles.slice(0, 10) // 只记录前10个
      },
      result: 'success'
    });

  } catch (error) {
    console.error("导出任务处理失败:", error);
    
    await supabase
      .from('export_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    await logAudit(supabase, {
      eventType: 'file.export',
      targetType: 'export_job',
      targetId: jobId,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
      result: 'failure'
    });
  }
}
