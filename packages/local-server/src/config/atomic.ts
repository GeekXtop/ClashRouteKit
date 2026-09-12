import { rename, rm, writeFile } from "node:fs/promises";

/**
 * 临时文件 + rename 的原子替换；rename 失败时清理残留临时文件，目标不受影响。
 */
export async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  try {
    await rename(tempPath, targetPath);
  } catch (error: unknown) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
