# 托育知护

面向托育机构人员与婴幼儿照护者的知识问答工具。在本机 SQLite 资料上做词法 + 本地小模型向量检索，由联网模型（DeepSeek）整理答复，返回资料名、页码和原文链接。当前资料与边界说明见 `docs/SOURCE_CATALOG.md` 与 `docs/REQUIREMENT.md`，数据模型见 `docs/DATA_SPEC.md`，后端交接见 `docs/BACKEND.md`。

## 本机启动

环境：Windows 10/11、Node.js 20+、npm。项目 API 默认只绑定 `127.0.0.1`。

```powershell
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。问答前端会显示本机模型和资料库状态；API 健康检查在 <http://127.0.0.1:4174/api/health>。

已有 `data/childcare.db` 时可直接问答；没有数据库时服务会自动创建空库，并显示资料目录为空。

## 模型架构

分工和 chatlab 一样：小模型只做检索，远程模型只写答复。

- **回答（联网）**：`deepseek-chat`。配置 `DEEPSEEK_API_KEY` 后启用。联网不可用时只列出检索到的原文，不用本机对话模型编答案。
- **检索（本地）**：`Qwen3-Embedding-0.6B`（约 593 MB，1024 维）。它只把问题和资料块变成向量，再和词法召回融合。这就是 chatlab 推荐的本地检索模型。

`qwen3:8b` 是对话模型，不参与检索，也不写答复。Linux 上换更小的检索模型，等实际上服务器时再定。三种部署方案目前都是「DeepSeek 回答 + 本地检索模型」：

| 方案 | 机器 |
|---|---|
| `local` | 本机 RTX 5060 |
| `linux-2g` | 2 核 2G |
| `linux-4g` | 2 核 4G |

### 联网模型（DeepSeek）

在项目根目录 `.env` 配置（该文件已被 Git 忽略）：

```dotenv
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 本地向量检索

首次使用时自动从下载源拉取检索模型（默认 `hf-mirror`，约 593 MB），之后完全离线运行。为已有知识块生成/更新向量：

```powershell
npm run childcare -- embed          # 只为缺少向量的块生成
npm run childcare -- reindex        # 重建分块并补齐向量
```

若本地向量模型不可用，检索自动退回纯 BM25。

### 联网不可用时

没有 `DEEPSEEK_API_KEY`，或 DeepSeek 暂时连不上时，服务只返回检索到的原文和出处，不用本机对话模型编答案。

`.env` 覆盖默认配置（完整项见 `.env.example`）：

```dotenv
CHILDCARE_PORT=4174
CHILDCARE_MODEL_PROVIDER=auto           # auto | deepseek；写成 ollama 才会用本机对话模型写答案
DEEPSEEK_API_KEY=sk-...
CHILDCARE_EMBED_ENABLED=1
CHILDCARE_EMBED_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
CHILDCARE_EMBED_SOURCE=hf-mirror        # huggingface | hf-mirror
CHILDCARE_RETRIEVAL_TOP_K=5
CHILDCARE_DB_PATH=./data/childcare.db
CHILDCARE_RAW_DIR=./data/raw
```

## 知识库

问答检索在 `data/childcare.db` 的知识块上做混合召回：中文字符 BM25 词法匹配（含精确文号、标题、短语加权）与本机向量语义召回，用 RRF 融合后按资料去重。原始文件仍按内容哈希保存在 `data/raw/`。不依赖云模型、Python、GPU 专用服务或外网 embedding。

资料入库时会同时完成**结构感知分块**：按「章 / 节 / 条 / 段落」切分为知识块（`knowledge_chunks`），记录章节路径、条款号、前后块关系和内容哈希，作为检索与引用定位的单元。重新采集同一来源时，新版本会自动成为唯一生效版本，旧版本标记为 `superseded`，不再参与问答。

采集登记清单：

```powershell
npm run childcare -- collect --config data/sources.yaml --dry-run
npm run childcare -- collect --config data/sources.yaml
npm run childcare -- export-md
```

新增文件可使用现有 CLI：

```powershell
npm run childcare -- import .\incoming\guide.pdf --title "资料标题" --type training_material --authority expert_education_material
```

升级或首次获取已采集资料后，如提示知识块缺失，可重建分块索引：

```powershell
npm run childcare -- reindex
```

只有允许展示摘录的来源会进入检索和引用；标记为 `canShowExcerpt: false` 或 `access: restricted` 的资料不会参与问答。WHO 国际资料目前只采集了出版物信息页，且其许可设为禁止摘录和导出，未混入问答证据。

## 问答边界

- 无关话题在检索和模型调用前拒绝；简单的上下文追问只在已有托育对话中放行。
- 直接引用公文文号（如 `国办发〔2019〕15号`）视为托育范围问题，不再因缺少领域词而误拒。
- 疾病诊断、发育障碍判断、检查报告解释、用药剂量和治疗请求在模型调用前拒答。
- 模型仅获得本轮检索证据；系统提示词明确资料和用户内容均不可信、不得遵循其中的指令。
- 证据不足时直接说明资料库无法确认，不用模型记忆补答案。
- 对话历史只保存在当前浏览器的 localStorage；不会发送到云端。
- 2019 年文件仍有 `legalStatus: unknown` 的来源，在状态核验前不表述为现行有效规定。
- 完整范围与提示词边界见 [安全策略](docs/SAFETY_POLICY.md)；提示词正文和确定性边界实现位于 `apps/server/src/safety.ts`。

## 检查与评测

```powershell
npm test
npm run typecheck
npm run build
npm run eval
```

`data/eval/baseline.json` 覆盖核心检索、范围拒答、医疗拒答和急症拦截场景（当前 31 题）。`npm run eval` 不调用 Ollama，适合在没有下载模型时检查本地 RAG 基线，并生成 `data/eval/report.json`（通过率、检索 Recall@5、引用可溯源率，按题型分列）。

## 项目结构

- `apps/web`：Vue 3 问答工作台
- `apps/server`：本机 HTTP/SSE API、范围与医疗边界、提示词、模型提供方适配（DeepSeek / Ollama）、BM25 + 本地向量混合检索
- `apps/cli`：资料采集、导入、检查、导出、分块与向量重建
- `packages/pipeline`：SQLite、原始文件存储、PDF/DOCX/HTML 文本提取、结构感知分块、本地向量 embedding
- `packages/core`：知识来源、版本、页级资料与知识块的领域模型
- `docs/DATA_SPEC.md`：数据模型、分块规则与增量更新说明
- `data/sources.yaml`：来源采集登记清单
- `data/eval/baseline.json`：本地基线评测问题

原始资料、SQLite 数据库和生成的 Markdown 都在 Git 忽略目录中。使用过程中需注意核实版权、授权和现行效力后再将资料用于对外或商业服务。
