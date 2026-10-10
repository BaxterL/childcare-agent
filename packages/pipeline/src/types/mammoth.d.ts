declare module "mammoth" {
  export interface ExtractRawTextOptions {
    path?: string;
    buffer?: Buffer;
  }
  export interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(options: ExtractRawTextOptions): Promise<ExtractResult>;
  export function convertToHtml(options: ExtractRawTextOptions): Promise<ExtractResult>;
  const mammoth: {
    extractRawText: typeof extractRawText;
    convertToHtml: typeof convertToHtml;
  };
  export default mammoth;
}
