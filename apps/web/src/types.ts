export interface SourceRef {
  index: number;
  chunkId: string;
  sourceId: string;
  versionId: string;
  title: string;
  organization: string;
  documentNo: string | null;
  sourceUrl: string | null;
  legalStatus: string;
  publishedAt: string | null;
  pageNumber: number;
  section: string;
  articleNumber: string | null;
  excerpt: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  organization: string;
  document_no: string | null;
  source_url: string | null;
  authority: string;
  notes: string | null;
  version_id: string;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  legal_status: string;
  page_count: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources?: SourceRef[];
  attachments?: { name: string }[];
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ModelStatus {
  provider: string;
  connected: boolean;
  installed: boolean;
  model: string;
  url: string;
}
