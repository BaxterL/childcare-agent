# 后端交接说明（Backend Handoff）

> 更新日期：2026-10-11
> 用途：给接手后端开发的 AI / 工程师的当前状态说明。描述以**代码现状**为准。
> 相关文档：`docs/DATA_SPEC.md`（数据模型与分块规则）、`docs/SAFETY_POLICY.md`（问答安全边界）、`docs/SOURCE_CATALOG.md`（语料采集队列）。

## 1. 技术栈与仓库结构

- Node.js（>=20）+ TypeScript，ESM，npm workspaces。**无 Web 框架**，后端用 `node:http` 原生实现。
- 数据库：SQLite（`node:sqlite`）。无外部服务依赖。
- 本地向量：`@huggingface/transformers`（transformers.js）+ onnxruntime-node，纯 JS 推理。

```
apps/server       后端 API + 静态托管（入口 index.ts）
apps/cli          命令行（数据采集/导入/维护）
apps/web          Vue 3 前端（另有 AI 在改，后端不要动）
packages/core     领域枚举与 schema（enums.ts / schema.ts）
packages/pipeline 数据层：SQLite、提取、分块、向量、仓储
data/             运行时数据（Git 忽略）：childcare.db / raw/ / models/ / eval/
tests/            跨包测试
```

后端相关目录：

- `packages/pipeline/src/`：`config.ts`、`context.ts`、`ingest.ts`、`storage.ts`、`db/`、`extract/`、`chunk/`、`embed/`、`collect/`、`repositories/`。
- `apps/server/src/`：`index.ts`（HTTP/SSE）、`retrieval.ts`、`semantic.ts`、`model.ts`、`safety.ts`、`evaluate.ts`。

## 2. 运行时（`apps/server/src/index.ts`）

- 启动即 `process.loadEnvFile(resolve(".env"))` 加载根目录 `.env`，`createContext()` 建库并跑迁移。
- 监听 `127.0.0.1:CHILDCARE_PORT`（默认 **4174**）。
- 同时把 `apps/web/dist` 作为静态站托管（`GET/HEAD`）；`/api/*` 之外的非静态请求返回 405。
- 启动时后台预热：`modelStatus()` 打印提供方，`startEmbedder()` 预加载本地向量模型。
- `SIGINT`/`SIGTERM` 关闭 server 并 `db.close()`。

## 3. HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，见下方结构 |
| GET | `/api/sources` | 可展示来源列表（`getVisibleSources`） |
| GET | `/api/sources/:sourceId/pages/:pageNumber` | 单页原文（受许可过滤） |
| POST | `/api/chat/stream` | 问答，SSE 流式 |
| * | `/api/*` | 未匹配返回 404 JSON |

`/api/health` 返回：

```json
{
  "status": "ok",
  "database_ready": true,
  "page_count": 9,
  "chunk_count": 79,
  "chunk_index_ready": true,
  "source_count": 5,
  "embedding": { "enabled": true, "model": "Xenova/bge-small-zh-v1.5", "dim": 512, "ready": true, "vector_count": 79, "error": null },
  "model": { "provider": "deepseek", "connected": false, "installed": true, "model": "deepseek-chat", "url": "https://api.deepseek.com" }
}
```

> `model.connected` 是 1.2~1.5s 超时探测结果，**偶发 false 不代表模型不可用**。

### SSE 事件

- `status`：`{ stage: "understanding" | "retrieving" | "answering" }`
- `sources`：证据数组（客户端版，每段摘录截 220 字，去掉 `text`/`score`）
- `delta`：`{ text }` 增量文本
- `warning`：`{ code, message }`（模型不可用降级时）
- `error`：`{ code, message }`
- `done`：`{ model, provider?, source_count }`

## 4. 问答流程（`chat()`）

1. `readJson`（上限 64KB）→ 问题 trim 后 ≤3000 字；`history` 取最后 8 条（每条 ≤2400 字，仅 user/assistant）。
2. **前置边界门**（`safety.ts`，命中即确定性回答，`done.model = "deterministic"`，**不调模型**）：
   - 急症信号 → `EMERGENCY_ANSWER`
   - 明显超域 → `OUT_OF_DOMAIN_ANSWER`
   - 医疗/发育障碍求助 → `MEDICAL_BOUNDARY_ANSWER`
3. 检索：`retrievalQuestion = question + 最近 4 条用户历史`；`embedQuery()` 得查询向量 → `searchEvidence(ctx, q, TOP_K, vector)` → 发 `sources`。
4. 无命中 → 确定性「没有依据」文案（不调模型）。
5. 有命中 → `buildMessages()`（system + 历史 + 证据 + 问题）→ `streamChat()` 流式 `delta`。
6. 模型失败：发 `warning(model_unavailable)` + `retrievalOnlyAnswer()`（只列原文位置）+ `done.model = "retrieval-only"`；不伪造生成式总结。

`buildMessages` 明确标注证据为「不可信资料」，并说明引用编号必须来自证据。

## 5. 模型层（`apps/server/src/model.ts`）

- 回答提供方：`deepseek`。本地小模型只做检索，不写答复（和 chatlab 的语义索引模型同一分工）。
- `resolveProviderOrder()`：读 `CHILDCARE_MODEL_PROVIDER`（`auto|deepseek|ollama`）。
  - `auto` / `deepseek`（默认）→ 配了 `DEEPSEEK_API_KEY` 则 `[deepseek]`，否则 `[]`（退回检索原文）
  - `ollama` → `[ollama]`（显式指定才用本机对话模型写答案）
- 流式：`streamDeepSeek`（OpenAI 兼容 `/chat/completions`，SSE）、`streamOllama`（`/api/chat`，NDJSON）。
- 参数：超时 180s，`max_tokens/num_predict = 1100`，`temperature 0.2`，Ollama `num_ctx` 夹在 4096~16384（默认 8192）。
- 降级策略：**仅在吐出任何 token 之前**失败才切换下一个提供方；已开始输出则不重试（避免半截答案）。
- `modelStatus()`：探活。deepseek 走 `/models`；ollama 走 `/api/tags` 并判断模型是否已 pull。

## 6. 检索（`apps/server/src/retrieval.ts`）

- `loadCandidates()`：**单条 SQL** 取「生效版本 + `can_show_excerpt=1` + `access_level != 'restricted'` + `char_count>0`」的知识块，并带出 `embedding` blob。
- 词法侧 `scoreBm25()`：中文 2~3 元 + 英文/数字词项，含停用词；叠加整句包含（+3）、文号命中（+4）、标题命中（+2）。
- 语义侧：查询向量与块向量做 `cosineSimilarity`。
- `fuseHybrid()`：**RRF 融合**（`k=60`，按排名不按原始分值），避免 BM25/余弦量纲问题。
- **无查询向量时退回纯 BM25**（阈值 `0.55`）——这条降级路径必须保留（评测走的就是它）。
- `selectDiverse()`：每来源最多 2 块，`top_k` 夹在 1~8。
- Evidence 字段：`index/chunkId/sourceId/versionId/title/organization/documentNo/sourceUrl/legalStatus/publishedAt/pageNumber/section/articleNumber/text/score`；`sectionLabel = 章节路径 · 条款号`。
- 另外导出 `getVisibleSources()`、`getVisiblePage()`、`getChunkStats()`。

## 7. 本地向量

- `packages/pipeline/src/embed/`：
  - `profiles.ts`：模型档案（维度、pooling、dtype、query 前缀）；`DEFAULT_EMBED_MODEL = Xenova/bge-small-zh-v1.5`（512 维，cls pooling）。
  - `embedder.ts`：`createLocalEmbedder()`，用 transformers.js 本机跑 ONNX。
  - `index.ts`：`embedVersionChunks()`（写向量 + 登记模型）、`cosineSimilarity`、`vectorToBuffer`/`bufferToVector`。
- 权重缓存在 `CHILDCARE_EMBED_CACHE_DIR`（默认 `./data/models`，**Git 忽略，不写系统盘**）；下载源 `hf-mirror`（默认，因 HuggingFace 被墙）或 `huggingface`。
- 向量以 Float32 BLOB 存 `knowledge_chunks.embedding`，`embedding_model` 记模型 id；`countEmbedded(modelId)` 统计覆盖率。
- `apps/server/src/semantic.ts`：懒加载 + 失败降级 + **5 分钟冷却重试**；`embeddingState()` 供 health 使用；`embedQuery()` 失败返回 null（即 BM25 检索）。
- 换 embedding 模型必须 `childcare embed --force` 重建向量。

## 8. 数据模型与迁移（`packages/pipeline/src/db/migrations.ts`）

- 迁移 001：知识源 / 版本 / 页 / 导入运行记录。
- 迁移 002：`knowledge_chunks`。
- 迁移 003：`knowledge_chunks` 加 `embedding`、`embedding_model`。
- 表要点：
  - `knowledge_sources`：`can_show_excerpt`、`access_level`、`can_export`、`license_type`、`authority_level` 控制可见性。
  - `knowledge_versions`：`is_active`、`legal_status`、`sha256`、`supersedes_version_id`。
  - `knowledge_pages`：页级 `clean_text`。
  - `knowledge_chunks`：`chunk_index`、`page_start/page_end`、`section_path`、`article_number`、`content_type`、`text`、`normalized_text`、`chunk_hash`、`prev/next_chunk_id`、`embedding`。
- **版本生效语义**：新版本先建为 `is_active=0`，由 `VersionRepository.setActiveExclusive()` 激活，保证每来源恰好一个生效版本；被替代版本置 `superseded`。检索只读 `is_active=1`。
- `createContext()`（`packages/pipeline/src/context.ts`）组装仓储：`sources/versions/pages/chunks/runs`，并打开数据库跑迁移。

## 9. CLI（`npm run childcare -- <cmd>`）

| 命令 | 说明 |
|---|---|
| `init` | 初始化数据库 |
| `source` | 知识源维护 |
| `import <file>` | 导入本地文件（PDF/DOCX/HTML 等） |
| `collect` | 按 `data/sources.yaml` 采集网页 |
| `reindex [--force]` | 重建分块并补齐本地向量 |
| `embed [--force]` | 只补 / 重建本地向量 |
| `versions [--source <id>] [--json]` | 列出版本 |
| `show <versionId> [--page <n>]` | 查看页级原文 |
| `chunks <versionId> [--limit <n>] [--json]` | 查看知识块（章节/条款标注） |
| `runs [--limit <n>] [--json]` | 查看导入/采集运行记录 |
| `export-md [--source <id>] [--out <dir>]` | 导出带元数据的 Markdown（受 `can_export` 限制） |

导入/采集会自动分块并应用增量生效；`reindex`/`embed` 用于历史数据回填与换模型重建。

## 10. 配置项（env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CHILDCARE_PORT` | `4174` | HTTP 端口 |
| `CHILDCARE_DB_PATH` | `./data/childcare.db` | SQLite 路径 |
| `CHILDCARE_RAW_DIR` | `./data/raw` | 原始文件（内容寻址） |
| `CHILDCARE_USER_AGENT` | `childcare-agent/0.1 ...` | 采集 UA |
| `CHILDCARE_FETCH_TIMEOUT_MS` | `30000` | 采集超时 |
| `CHILDCARE_MAX_DOWNLOAD_BYTES` | `52428800` | 单文档下载上限 |
| `CHILDCARE_RETRIEVAL_TOP_K` | `5` | 检索条数（1~8） |
| `CHILDCARE_MODEL_PROVIDER` | `auto` | `auto\|deepseek\|ollama` |
| `DEEPSEEK_API_KEY` | 空 | 配置后启用联网主模型 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | |
| `DEEPSEEK_MODEL` | `deepseek-chat` | |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | |
| `OLLAMA_MODEL` | `qwen3:8b` | |
| `OLLAMA_CONTEXT_TOKENS` | `8192` | 夹在 4096~16384 |
| `CHILDCARE_EMBED_ENABLED` | `1` | 关闭则纯 BM25 |
| `CHILDCARE_EMBED_MODEL` | `Xenova/bge-small-zh-v1.5` | |
| `CHILDCARE_EMBED_CACHE_DIR` | `./data/models` | 模型缓存（Git 忽略） |
| `CHILDCARE_EMBED_SOURCE` | `hf-mirror` | `huggingface\|hf-mirror` |

## 11. 测试与评测

- `npm test`：vitest，**30 个用例**（`safety` 8、`model` 4、`retrieval` 6、`chunker` 5、`pipeline` 7）。
- `npm run eval`：读 `data/eval/baseline.json`（**31 题**：retrieval 19 / off_topic 4 / medical 5 / emergency 3），写 `data/eval/report.json`（Git 忽略）；有失败 `exitCode=1`。当前结果：31/31，Recall@5 100%，引用可溯源率 100%。
- `npm run typecheck`（各包 + `vue-tsc`）、`npm run build`。

## 12. 当前状态（2026-10-11）

- 本地库：**9 页 / 79 块 / 5 来源 / 79 条向量**（已全覆盖，模型 `bge-small-zh-v1.5`，512 维）。
- 已实测端到端：一问「孩子在园里中午睡不着怎么安抚」→ 混合检索把《保育指导大纲》「第二章 > 二、睡眠」排到第 1，DeepSeek 带 `[1]` 引用作答，医疗边界保留。
- 模型：DeepSeek 只负责回答；本地 ONNX（`bge-small-zh-v1.5`）只负责检索。`qwen3:8b` 不参与问答。

## 13. 已知空缺与注意事项（给下一位）

- **前端 `apps/web` 另有 AI 在改，后端任务不要动前端。**
- `.env` 含真实 `DEEPSEEK_API_KEY`（Git 忽略），**余额约 ¥5，测试尽量少发请求**。
- **没有独立 `/api/search` 接口**：检索只在 chat 内暴露；如需外部检索需新增。
- **没有显式知识范围选择**（年龄段 / 主题 / 岗位）——需求 ⑤ 尚缺。
- 向量检索是**全量 JS 暴力余弦**：数百块规模没问题，上量需引入 `sqlite-vec` 之类索引。
- `embedQuery` 把历史一起编码，可能稀释查询向量；如需可只对当前问题编码。
- 换 embedding 模型后旧向量不匹配，必须 `embed --force` 重建。
- DB 中存在历史重复知识源（同一政策解读因标题标点差异两条记录），可做逻辑合并。
- 采集/导入的**原始响应**在 `data/raw/`，`data/models/`、`data/childcare.db` 均 Git 忽略。
