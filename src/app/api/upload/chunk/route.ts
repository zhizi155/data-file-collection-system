import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { Readable } from "stream";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 使用文件存储分片数据（适合无服务器环境）
const CHUNK_DIR = "/tmp/chunks";

// 确保分片目录存在
if (!existsSync(CHUNK_DIR)) {
  mkdirSync(CHUNK_DIR, { recursive: true });
}

// 分片上传接口
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunkData = formData.get("file");
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
    const totalChunks = parseInt(formData.get("totalChunks") as string, 10);
    const objectKey = formData.get("objectKey") as string;
    const fileName = formData.get("fileName") as string;
    const fileSize = parseInt(formData.get("fileSize") as string, 10);

    if (!chunkData || isNaN(chunkIndex) || isNaN(totalChunks) || !objectKey) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 将分片数据转为 Buffer
    let buffer: Buffer;
    if (typeof chunkData === "object" && chunkData !== null && "arrayBuffer" in chunkData) {
      buffer = Buffer.from(await (chunkData as File).arrayBuffer());
    } else if (Buffer.isBuffer(chunkData)) {
      buffer = chunkData;
    } else if (typeof chunkData === "string") {
      buffer = Buffer.from(chunkData);
    } else {
      buffer = Buffer.from(await (chunkData as Blob).arrayBuffer());
    }

    // 使用 objectKey 作为分片存储的目录名（确保唯一性）
    const safeKey = objectKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const chunkDir = join(CHUNK_DIR, `${safeKey}_${fileSize}`);
    
    // 创建分片目录
    if (!existsSync(chunkDir)) {
      mkdirSync(chunkDir, { recursive: true });
    }

    // 保存分片到文件
    const chunkPath = join(chunkDir, `chunk_${chunkIndex}`);
    writeFileSync(chunkPath, buffer);

    console.log(`收到分片 ${chunkIndex + 1}/${totalChunks}，文件: ${fileName}`);

    // 检查已上传的分片数量
    const uploadedChunks = readdirSync(chunkDir).filter(f => f.startsWith("chunk_")).length;

    // 检查是否所有分片都已上传
    if (uploadedChunks === totalChunks) {
      console.log(`所有分片已收到，开始合并上传: ${fileName}`);
      
      // 按顺序读取并合并所有分片
      const chunks: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = join(chunkDir, `chunk_${i}`);
        if (existsSync(chunkPath)) {
          chunks.push(readFileSync(chunkPath));
        } else {
          console.error(`分片 ${i} 不存在`);
          return NextResponse.json(
            { error: `分片 ${i} 不存在` },
            { status: 500 }
          );
        }
      }
      
      const mergedBuffer = Buffer.concat(chunks);
      console.log(`合并完成，大小: ${mergedBuffer.length} bytes`);
      
      // 流式上传到S3
      const readable = Readable.from(mergedBuffer);
      const uploadResult = await storage.streamUploadFile({
        stream: readable,
        fileName: objectKey,
        contentType: "application/octet-stream",
      });

      console.log(`S3 上传结果: ${JSON.stringify(uploadResult)}`);
      console.log(`文件上传成功: ${objectKey}`);

      // 清理分片文件
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = join(chunkDir, `chunk_${i}`);
          if (existsSync(chunkPath)) {
            unlinkSync(chunkPath);
          }
        }
        // 使用 rmdir 删除空目录
        const { rmdirSync } = require('fs');
        if (existsSync(chunkDir)) {
          rmdirSync(chunkDir);
        }
      } catch (e) {
        console.error("清理分片文件失败:", e);
      }

      return NextResponse.json({
        success: true,
        fileKey: objectKey,
        message: "所有分片上传完成",
      });
    }

    return NextResponse.json({
      success: true,
      uploadedChunks,
      totalChunks,
      message: `分片 ${chunkIndex + 1}/${totalChunks} 上传成功`,
    });
  } catch (error) {
    console.error("分片上传失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分片上传失败" },
      { status: 500 }
    );
  }
}
