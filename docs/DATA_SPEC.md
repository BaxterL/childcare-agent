# 数据模型与分块规范

> 依据：领域模型见 `packages/core/src/schema.ts` 与 `packages/core/src/enums.ts`。
> 单一代码来源：枚举与 schema 在 `packages/core/src/enums.ts`、`packages/core/src/schema.ts`；表结构在 `packages/pipeline/src/db/migrations.ts`。
> 本文件描述已实现的数据模型，未实现字段以「规划」标注。

## 表结构

SQLite 使用版本化迁移（`user_version` 记录已应用数量），迁移只追加、不修改历史项。

### `knowledge_sources`（逻辑知识源）

一份可独立命名的资料，例如「托育机构设置标准（试行）」。字段：`id`、`canonical_title`、`source_type`、`issuing_org`、`document_no`、`jurisdiction`、`authority_level`、`normative_status`、`access_level`、`source_url`、`copyright_owner`、`license_type`、`license_expiry`、`can_store_full_text`、`can_show_excerpt`、`can_export`、`purchase_record`、`notes`、`created_at`。

`authority_level`（权威等级）与 `legal_status`（效力状态）分开保存。检索与引用受 `can_show_excerpt` 和 `access_level` 控制。

### `knowledge_versions`（知识源版本）

同一知识源的不同物理内容各存一个版本。字段：`id`、`source_id`、`version_label`、`sha256`、`file_path`、`original_filename`、`mime_type`、`byte_size`、`source_url`、`published_at`、`effective_from`、`effective_to`、`legal_status`、`is_active`、`supersedes_version_id`、`verified_at`、`verified_by`、`ingestion_run_id`、`created_at`。

`(source_id, sha256)` 唯一，用于内容去重。

### `knowledge_pages`（页级原文）

`id`、`version_id`、`page_number`、`raw_text`、`clean_text`、`extraction_method`、`ocr_confidence`、`is_empty`、`char_count`。HTML/Markdown/DOCX 等无分页格式写入单页（`page_number = 1`）。

### `knowledge_chunks`（知识块，检索单元）

页级原文按文档结构切分后的检索和引用单元。字段：`id`、`version_id`、`chunk_index`、`page_start`、`page_end`、`section_path`、`article_number`、`paragraph_number`、`content_type`、`text`、`normalized_text`、`chunk_hash`、`char_count`、`previous_chunk_id`、`next_chunk_id`、`embedding`、`embedding_model`、`created_at`。

- `section_path`：当前章节路径，如 `第二章 目标与要求 > 一、营养与喂养`。
- `article_number`：块**起始**处的条款号，如 `第十二条`；无则 `null`。
- `content_type`：`heading` / `body` / `list` / `table` / `attachment`（当前实现产出前三种）。
- `embedding`：本地向量（Float32 BLOB，可为空）；`embedding_model` 记录生成它的模型 id，换模型需重建。
- `(version_id, chunk_index)` 唯一；`previous_chunk_id` / `next_chunk_id` 串起同版本相邻块。

### `ingestion_runs`（导入/采集运行记录）

`id`、`status`（`running` / `succeeded` / `failed`）、`input_path`、`input_url`、`source_id`、`version_id`、`page_count`、`char_count`、`error`、`notes`、`started_at`、`finished_at`。

## 分块规则

实现位于 `packages/pipeline/src/chunk/chunker.ts`：

1. 先按换行拆分为段落，再在页内累积为块，块大小上限 700 字符，**块不跨页**，因此每条引用都对应唯一页码。
2. 识别结构标题：`第X章`、`第X节`、`一、二、`（短行且不以句号结尾）。标题更新章节状态并单独成块（`content_type = heading`）。
3. 识别条款：段首 `第X条` 更新当前条款号，随后的正文块继承该条款号。
4. 章节与条款状态在页之间延续：PDF 某页续写「第十二条」时仍能标注正确章节。
5. `normalized_text` 为小写、压缩空白后的文本，用于 BM25 匹配并计算 `chunk_hash`。

正文章节判定带保守启发式（短行、无句末标点），避免把正文里的「一、为贯彻……」误判为标题。

## 增量更新

做到「新增资料可增量入库并生效」：

1. 采集或导入时算 SHA256；同一 `source_id` 已有相同哈希则跳过写入（`deduplicated = true`）。
2. 内容变化时写入新版本，随后 `VersionRepository.setActiveExclusive()` 把该来源的其他版本全部置 `is_active = 0`，并记录 `supersedes_version_id`。
3. 重新导入此前被替代的内容时，该旧版本会被重新激活，并取代当前版本。
4. 检索只读取 `is_active = 1` 的版本，因此过期资料默认不参与问答。
5. 旧版本数据不删除，可回溯；如需按历史版本查询，可在检索层扩展时间维度（规划）。

每次导入都会调用 `indexVersionChunks()` 重建该版本的知识块，重建是幂等的（先删后插）。历史数据回填使用：

```powershell
npm run childcare -- reindex          # 只处理尚无知识块的生效版本
npm run childcare -- reindex --force  # 全部重建
```

## 本地向量检索

检索的语义部分完全在本机完成，参考 chatlab 的做法：远程模型只负责生成答复。

- 实现位于 `packages/pipeline/src/embed/`：`profiles.ts` 定义模型档案（维度、pooling、dtype、query 前缀），`embedder.ts` 用 `@huggingface/transformers` 在本地跑 ONNX。默认模型 `Xenova/bge-small-zh-v1.5`（512 维，cls pooling）。
- 模型文件缓存在 `CHILDCARE_EMBED_CACHE_DIR`（默认 `./data/models`，Git 忽略），首次从 `hf-mirror` 或 huggingface 拉取后即可离线运行。
- 向量以 Float32 BLOB 存在 `knowledge_chunks.embedding`，并登记 `embedding_model`。换模型时旧向量不再匹配，需重建。
- 生成/更新向量：

```powershell
npm run childcare -- embed          # 只为缺少当前模型向量的块生成
npm run childcare -- embed --force  # 全部重建
```

- 服务端 `apps/server/src/semantic.ts` 懒加载模型；加载失败自动降级为纯 BM25，并在一段冷却后重试。

## 检索与引用

检索实现位于 `apps/server/src/retrieval.ts`：

1. 单条 SQL 读取「生效版本 + 允许摘录 + 非受限访问」的知识块及其向量。
2. 词法侧：中文 2~3 元 + 英文/数字词项的 BM25，叠加整句包含、文号、标题加权。
3. 语义侧：把问题向量化（加 query 前缀），与块向量做余弦相似度。
4. 两路排名用 RRF 融合（`k = 60`，按排名而非原始分值），避免校准问题；无查询向量时退回纯 BM25。
5. 按来源限制每轮最多 2 块，保证来源多样性。
6. 每条证据携带 `chunk_id`、`section`（章节路径 + 条款号）、`page_number`，供前端定位原文。

`/api/health` 暴露 `chunk_count`、`chunk_index_ready` 与 `embedding`（模型、维度、就绪状态、`vector_count`），用于确认分块与向量索引状态。

## 参考

- 领域枚举与 schema：`packages/core/src/enums.ts`、`packages/core/src/schema.ts`
- 迁移：`packages/pipeline/src/db/migrations.ts`
- 分块器：`packages/pipeline/src/chunk/chunker.ts`
- 本地向量：`packages/pipeline/src/embed/`、`apps/server/src/semantic.ts`
- 混合检索：`apps/server/src/retrieval.ts`
- 模型提供方：`apps/server/src/model.ts`
- 增量生效：`packages/pipeline/src/ingest.ts`、`packages/pipeline/src/repositories/versions.ts`
