import { describe, expect, it } from "vitest";
import { extractUpload, UploadExtractError } from "@childcare/pipeline";
import {
  ATTACHMENT_CHAR_LIMIT,
  ATTACHMENT_COUNT_LIMIT,
  attachmentTooLongMessage,
  parseMultipart,
  questionTooLongMessage,
  safeAttachments,
  tooManyFilesMessage,
} from "./attachments.js";

describe("问答附件", () => {
  it("超限文案在超出之后才带上具体字数", () => {
    expect(questionTooLongMessage(3001)).toContain("3000");
    expect(questionTooLongMessage(3001)).toContain("3001");
    expect(attachmentTooLongMessage(ATTACHMENT_CHAR_LIMIT + 1)).toContain(String(ATTACHMENT_CHAR_LIMIT));
    expect(tooManyFilesMessage()).toContain(String(ATTACHMENT_COUNT_LIMIT));
  });

  it("只保留前三个有文字的附件", () => {
    const files = safeAttachments([
      { name: "一.txt", text: "午睡" },
      { name: "../二.docx", text: "喂养" },
      { name: "三.pdf", text: "消毒" },
      { name: "四.pdf", text: "不该留下" },
      { name: "空.pdf", text: "   " },
    ]);
    expect(files.map((file) => file.name)).toEqual(["一.txt", "二.docx", "三.pdf"]);
  });

  it("能从 multipart 正文里取出文件", () => {
    const body = Buffer.from(
      [
        "--bound",
        'Content-Disposition: form-data; name="file"; filename="午睡.txt"',
        "Content-Type: text/plain",
        "",
        "巡视记录",
        "--bound--",
        "",
      ].join("\r\n"),
    );
    const files = parseMultipart(body, "bound");
    expect(files).toHaveLength(1);
    expect(files[0]?.filename).toBe("午睡.txt");
    expect(files[0]?.data.toString("utf8")).toBe("巡视记录");
  });

  it("读取文本上传，并拒绝旧版 Word", async () => {
    await expect(extractUpload("园所.txt", Buffer.from("托育午睡巡视"))).resolves.toBe("托育午睡巡视");
    await expect(extractUpload("旧稿.doc", Buffer.from("x"))).rejects.toBeInstanceOf(UploadExtractError);
  });
});
