import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { Readable } from "stream";

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// 内存中存储分片（用于小规模并发）
// 注意：生产环境应使用 Redis 或其他分布式存储
const chunkStore = new Map<string, { chunks: Buffer[]; totalChunks: number; uploaded: Set<number> }>();

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
      // File 对象
      buffer = Buffer.from(await (chunkData as File).arrayBuffer());
    } else if (Buffer.isBuffer(chunkData)) {
      buffer = chunkData;
    } else if (typeof chunkData === "string") {
      buffer = Buffer.from(chunkData);
    } else {
      buffer = Buffer.from(await (chunkData as Blob).arrayBuffer());
    }

    // 保存分片到内存
    const chunkKey = `${objectKey}-${fileSize}`;
    if (!chunkStore.has(chunkKey)) {
      chunkStore.set(chunkKey, {
        chunks: new Array(totalChunks),
        totalChunks,
        uploaded: new Set(),
      });
    }

    const store = chunkStore.get(chunkKey)!;
    store.chunks[chunkIndex] = buffer;
    store.uploaded.add(chunkIndex);

    console.log(`收到分片 ${chunkIndex + 1}/${totalChunks}，文件: ${fileName}`);

    // 检查是否所有分片都已上传
    if (store.uploaded.size === totalChunks) {
      console.log(`所有分片已收到，开始合并上传: ${fileName}`);
      
      // 合并分片
      const mergedBuffer = Buffer.concat(store.chunks);
      console.log(`合并完成，大小: ${mergedBuffer.length} bytes`);
      
      // 流式上传到S3，使用传入的 objectKey 作为最终 key
      const readable = Readable.from(mergedBuffer);
      await storage.streamUploadFile({
        stream: readable,
        fileName: objectKey,
        contentType: "application/octet-stream",
      });

      // 使用传入的 objectKey 作为最终的文件 key
      const finalKey = objectKey;
      console.log(`文件上传成功: ${finalKey}`);

      // 清理内存
      chunkStore.delete(chunkKey);

      return NextResponse.json({
        success: true,
        fileKey: finalKey,
        message: "所有分片上传完成",
      });
    }

    return NextResponse.json({
      success: true,
      uploadedChunks: store.uploaded.size,
      totalChunks,
      message: `分片 ${chunkIndex + 1}/${totalChunks} 上传成功`,
    });
  } catch (error) {
    console.error("分片上传失败:", error);
    return NextResponse.json(
      { error: "分片上传失败" },
      { status: 500 }
    );
  }
}
