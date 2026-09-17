import { S3Client } from "@aws-sdk/client-s3";

/**
 * Coze object storage requires its workload identity token on every S3 request.
 * The official S3Storage wrapper injects the same header internally; raw AWS
 * clients used for multipart operations must do it explicitly.
 */
export function createStorageS3Client(): S3Client {
  const client = new S3Client({
    region: "cn-beijing",
    endpoint: process.env.COZE_BUCKET_ENDPOINT_URL,
    credentials: { accessKeyId: "", secretAccessKey: "" },
    forcePathStyle: true,
  });

  client.middlewareStack.add(
    (next) => async (args) => {
      const token = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
      const request = args.request as { headers?: Record<string, string> };
      if (token && request.headers) request.headers["x-storage-token"] = token;
      return next(args);
    },
    { step: "build", name: "injectCozeStorageToken" },
  );

  return client;
}
