import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { S3Storage } from 'coze-coding-dev-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storage = new S3Storage();

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'admin-secret'}`) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    console.log('🔍 开始清理重复文件...\n');

    // 获取所有文件，按创建时间倒序
    const { data: files, error } = await supabase
      .from('uploaded_files')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取文件失败:', error);
      return NextResponse.json({ error: '获取文件失败', details: error }, { status: 500 });
    }

    console.log(`📊 总文件数: ${files?.length || 0}\n`);

    // 按 shop_id + export_type 分组
    const groups = new Map<string, typeof files>();
    
    files?.forEach(file => {
      const key = `${file.shop_id}|${file.export_type}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(file);
    });

    let totalDuplicates = 0;
    let totalStorageFreed = 0;
    const deletedFiles: string[] = [];

    // 处理每个组
    for (const [key, groupFiles] of groups) {
      if (groupFiles.length > 1) {
        const [shopId, exportType] = key.split('|');
        console.log(`📁 店铺 ${shopId.substring(0, 8)}... + 类型 ${exportType}:`);
        console.log(`   重复文件数: ${groupFiles.length}`);

        // 保留最新的一个
        const toKeep = groupFiles[0];
        const toDelete = groupFiles.slice(1);

        console.log(`   保留: ${toKeep.id} (${toKeep.original_name})`);
        
        let groupStorageFreed = 0;
        for (const file of toDelete) {
          console.log(`   删除: ${file.id} (${file.original_name})`);
          
          // 删除存储文件
          try {
            await storage.deleteFile({
              fileKey: file.stored_key,
              bucket: 'files'
            });
            console.log(`     ✓ 已删除存储文件`);
          } catch (e) {
            console.log(`     ⚠ 删除存储文件失败: ${e}`);
          }

          // 删除数据库记录
          const { error: deleteError } = await supabase
            .from('uploaded_files')
            .delete()
            .eq('id', file.id);

          if (deleteError) {
            console.log(`     ⚠ 删除数据库记录失败: ${deleteError.message}`);
          } else {
            console.log(`     ✓ 已删除数据库记录`);
            deletedFiles.push(file.id);
          }

          groupStorageFreed += parseInt(file.file_size) || 0;
          totalDuplicates++;
        }
        
        totalStorageFreed += groupStorageFreed;
        console.log(`   释放空间: ${(groupStorageFreed / 1024 / 1024).toFixed(2)} MB\n`);
      }
    }

    const result = {
      success: true,
      totalFiles: files?.length || 0,
      deletedCount: totalDuplicates,
      freedStorageMB: (totalStorageFreed / 1024 / 1024).toFixed(2),
      deletedFileIds: deletedFiles
    };

    console.log('═══════════════════════════════════════');
    console.log(`✅ 清理完成！`);
    console.log(`   删除重复文件: ${totalDuplicates} 个`);
    console.log(`   释放存储空间: ${result.freedStorageMB} MB`);
    console.log('═══════════════════════════════════════');

    return NextResponse.json(result);
  } catch (error) {
    console.error('清理失败:', error);
    return NextResponse.json({ error: '清理失败', details: String(error) }, { status: 500 });
  }
}
