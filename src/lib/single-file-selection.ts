export interface SingleFileSelection<T> {
  file: T | null;
  error: string | null;
}

export function selectSingleFile<T>(
  files: readonly T[],
  currentFileCount: number,
): SingleFileSelection<T> {
  if (files.length === 0) return { file: null, error: null };
  if (files.length > 1) {
    return { file: null, error: "每次只能上传 1 个文件，请重新选择" };
  }
  if (currentFileCount > 0) {
    return { file: null, error: "请先完成或移除当前文件，再选择新文件" };
  }
  return { file: files[0], error: null };
}
