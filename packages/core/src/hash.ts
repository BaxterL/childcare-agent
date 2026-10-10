import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256Text(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** 流式计算文件 SHA256，避免把大文件整个读进内存。 */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
