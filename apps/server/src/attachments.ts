import type { IncomingMessage } from "node:http";
import { extractUpload, UploadExtractError } from "@childcare/pipeline";

/** Question length. The composer hides this number until the text goes past it. */
export const QUESTION_CHAR_LIMIT = 3000;
/** Extracted text shared by all attachments on one turn. */
export const ATTACHMENT_CHAR_LIMIT = 8000;
export const ATTACHMENT_COUNT_LIMIT = 3;
export const ATTACHMENT_BYTE_LIMIT = 8 * 1024 * 1024;

export interface ChatAttachment {
  name: string;
  text: string;
}

export function questionTooLongMessage(length: number): string {
  return `问题已超过 ${QUESTION_CHAR_LIMIT} 字（现为 ${length} 字），请删减后再发送。`;
}

export function attachmentTooLongMessage(length: number): string {
  return `附件文字已超过 ${ATTACHMENT_CHAR_LIMIT} 字（现为 ${length} 字），请删减后再发送。`;
}

export function tooManyFilesMessage(): string {
  return `一次最多 ${ATTACHMENT_COUNT_LIMIT} 个文件。`;
}

export function fileTooLargeMessage(name: string): string {
  return `《${name}》超过 8 MB，请换一份更小的文件。`;
}

export function emptyFileMessage(name: string): string {
  return `《${name}》没有识别出文字，可能是扫描件。`;
}

export function displayName(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() || "未命名文件";
  return base.slice(0, 80);
}

export function attachmentChars(files: ChatAttachment[]): number {
  return files.reduce((sum, file) => sum + file.text.length, 0);
}

/** Keep only well-formed attachments and enforce the count. Text length is checked by the caller. */
export function safeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  const files: ChatAttachment[] = [];
  for (const item of raw) {
    if (files.length >= ATTACHMENT_COUNT_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? displayName(record.name) : "";
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!name || !text) continue;
    files.push({ name, text });
  }
  return files;
}

interface MultipartFile {
  filename: string;
  data: Buffer;
}

export function parseMultipart(body: Buffer, boundary: string): MultipartFile[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const files: MultipartFile[] = [];
  let cursor = body.indexOf(delimiter);
  while (cursor >= 0) {
    let start = cursor + delimiter.length;
    if (body.subarray(start, start + 2).toString() === "--") break;
    if (body.subarray(start, start + 2).toString() === "\r\n") start += 2;
    const next = body.indexOf(delimiter, start);
    if (next < 0) break;
    let chunk = body.subarray(start, next);
    if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
      chunk = chunk.subarray(0, chunk.length - 2);
    }
    const separator = chunk.indexOf("\r\n\r\n");
    if (separator >= 0) {
      const headers = chunk.subarray(0, separator).toString("utf8");
      const filename = filenameFrom(headers);
      if (filename) files.push({ filename, data: chunk.subarray(separator + 4) });
    }
    cursor = next;
  }
  return files;
}

function filenameFrom(headers: string): string {
  const encoded = /filename\*=UTF-8''([^;\r\n]+)/i.exec(headers)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the plain filename parameter.
    }
  }
  return /filename="([^"]*)"/.exec(headers)?.[1] ?? "";
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new UploadExtractError(fileTooLargeMessage("文件"));
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function readUploadedFiles(request: IncomingMessage): Promise<ChatAttachment[]> {
  const header = request.headers["content-type"] ?? "";
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(header);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) throw new UploadExtractError("请按文件上传。");
  const body = await readBody(request, ATTACHMENT_BYTE_LIMIT * ATTACHMENT_COUNT_LIMIT + 1024 * 1024);
  const parts = parseMultipart(body, boundary.trim());
  if (!parts.length) throw new UploadExtractError("没有收到文件。");
  if (parts.length > ATTACHMENT_COUNT_LIMIT) throw new UploadExtractError(tooManyFilesMessage());

  const files: ChatAttachment[] = [];
  for (const part of parts) {
    const name = displayName(part.filename);
    if (part.data.byteLength > ATTACHMENT_BYTE_LIMIT) throw new UploadExtractError(fileTooLargeMessage(name));
    const text = await extractUpload(name, part.data);
    if (!text) throw new UploadExtractError(emptyFileMessage(name));
    files.push({ name, text });
  }
  if (attachmentChars(files) > ATTACHMENT_CHAR_LIMIT) {
    throw new UploadExtractError(attachmentTooLongMessage(attachmentChars(files)));
  }
  return files;
}
