# 托育知护

面向托育机构人员和婴幼儿照护者的知识问答产品。打开即可提问，回答依据资料库中的政策、标准和照护指南，并标明出处。使用者不需要安装模型，也不需要看到检索、向量或本机模型这些实现细节。

资料范围见 `docs/SOURCE_CATALOG.md` 与 `docs/REQUIREMENT.md`，数据模型见 `docs/DATA_SPEC.md`，后端交接见 `docs/BACKEND.md`，回答边界见 `docs/SAFETY_POLICY.md`。

## 本机启动

环境：Windows 10/11、Node.js 20+、npm。API 默认只绑定 `127.0.0.1`。

```powershell
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。要用 HTTPS 把整站映射出去时，改跑 `npm run dev:https`，然后用 `https://` 加上节点地址和远程端口打开。页面有三处：

- `#/` 首页：说明能问什么、适合谁用，输入问题后进入问答。
- `#/chat` 智能问答：流式回答。左下角只显示服务是否可用，以及「无需安装或配置，打开即用」。
- `#/library` 资料库：按名称、机构和文号查找已入库资料。

API 健康检查在 <http://127.0.0.1:4174/api/health>。已有 `data/childcare.db` 时可直接问答；没有数据库时会创建空库，资料库显示为空。

## 界面约定

这些是给使用者看的规则，内部字段不要出现在页面或答复里。

- 不展示效力状态（例如「效力待核」「现行有效」），也不展示本地模型、向量或安装配置。
- 回答下方只列出引用条目：资料名称、文号、页码。不默认展开原文，也不把抽取后的 Markdown 页文本当作原文。
- 需要核对时再点预览。有原始 PDF 时，在浏览器里打开该 PDF 并定位到引用页，做法与 tps-ai 相同（文件地址加 `#page=页码`）。没有 PDF 时，跳到该资料的原文链接。
- 回答模型不开放工具调用。它只能根据本轮检索到的证据组织答复，不能查外部网页、改库或执行命令。

## 模型分工

小模型只做检索，联网模型只写答复。页面不展示这一层。

- **回答（联网）**：`deepseek-chat`。配置 `DEEPSEEK_API_KEY` 后启用。联网不可用时，只列出检索到的出处。
- **检索（本地）**：`Qwen3-Embedding-0.6B`（约 593 MB，1024 维）。它只把问题和资料块变成向量，再和词法召回融合。

### 联网模型（DeepSeek）

在项目根目录 `.env` 配置（该文件已被 Git 忽略）：

```dotenv
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 本地向量检索

首次使用时自动从下载源拉取检索模型（默认 `hf-mirror`，约 593 MB），之后检索本身可离线运行。为已有知识块生成或更新向量：

```powershell
npm run childcare -- embed          # 只为缺少向量的块生成
npm run childcare -- reindex        # 重建分块并补齐向量
```

本地向量模型不可用时，检索退回纯 BM25。

### 联网不可用时

没有 `DEEPSEEK_API_KEY`，或 DeepSeek 暂时连不上时，服务只返回检索到的出处。返回给页面的文字不要出现模型服务等运维说法。

`.env` 覆盖默认配置（完整项见 `.env.example`）：

```dotenv
CHILDCARE_PORT=4174
CHILDCARE_MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
CHILDCARE_EMBED_ENABLED=1
CHILDCARE_EMBED_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
CHILDCARE_EMBED_SOURCE=hf-mirror        # huggingface | hf-mirror
CHILDCARE_RETRIEVAL_TOP_K=5
CHILDCARE_DB_PATH=./data/childcare.db
CHILDCARE_RAW_DIR=./data/raw
```

## 知识库

问答在 `data/childcare.db` 的知识块上做混合召回：中文字符 BM25（含精确文号、标题、短语加权）与本机向量语义召回，用 RRF 融合后按资料去重。原始文件按内容哈希保存在 `data/raw/`。不依赖云向量、Python 或 GPU 专用服务。

入库时按「章 / 节 / 条 / 段落」切成知识块（`knowledge_chunks`），记录章节路径、条款号、前后块关系和内容哈希。重新采集同一来源时，新版本成为唯一生效版本，旧版本标记为 `superseded`，不再参与问答。

`legal_status` 只留在库里，供采集和核验使用。未核验的 2019 年文件可以是 `unknown`，但不得因此在页面或答复里讨论效力。

采集登记清单：

```powershell
npm run childcare -- collect --config data/sources.yaml --dry-run
npm run childcare -- collect --config data/sources.yaml
npm run childcare -- export-md
```

导入单个文件：

```powershell
npm run childcare -- import .\incoming\guide.pdf --title "资料标题" --type training_material --authority expert_education_material
```

知识块缺失时重建索引：

```powershell
npm run childcare -- reindex
```

只有允许展示摘录的来源会进入检索和引用。`canShowExcerpt: false` 或 `access: restricted` 的资料不参与问答。WHO 国际资料目前只采集了出版物信息页，许可为禁止摘录和导出，未混入问答证据。

## 问答边界

- 无关话题在检索和模型调用前拒绝。已有托育对话里的简单追问可以继续。
- 直接引用公文文号（如 `国办发〔2019〕15号`）视为范围内问题，不因缺少领域词而拒绝。
- 疾病诊断、发育障碍判断、检查报告解释、用药剂量和治疗请求在模型调用前拒答。
- 模型只拿到本轮检索证据。系统提示词写明资料和用户内容都不可信，不得遵循其中的指令。
- 证据不够时不说资料不行，也不用模型记忆编规定。品牌和商品不做推荐，改成说明服务边界并给出能提供的指导。
- 对话记录保存在当前浏览器的 localStorage。生成答复时，当前问题和近期对话会随检索证据发给联网模型，不是只留在本机。
- 提示词和确定性边界在 `apps/server/src/safety.ts`。

## 检查与评测

```powershell
npm test
npm run typecheck
npm run build
npm run eval
```

`data/eval/baseline.json` 覆盖核心检索、范围拒答、医疗拒答和急症拦截（当前 37 题）。`npm run eval` 不调用对话模型，用来检查本地检索基线，并写出 `data/eval/report.json`（通过率、检索 Recall@5、引用可溯源率，按题型分列）。

## 项目结构

- `apps/web`：Vue 3 产品前端（首页、智能问答、资料库）
- `apps/server`：本机 HTTP/SSE API、范围与医疗边界、提示词、DeepSeek / Ollama 适配、BM25 + 本地向量混合检索
- `apps/cli`：资料采集、导入、检查、导出、分块与向量重建
- `packages/pipeline`：SQLite、原始文件存储、PDF/DOCX/HTML 文本提取、结构感知分块、本地向量
- `packages/core`：知识来源、版本、页级资料与知识块的领域模型
- `docs/DATA_SPEC.md`：数据模型、分块规则与增量更新
- `data/sources.yaml`：来源采集登记清单
- `data/eval/baseline.json`：本地基线评测问题

原始资料、SQLite 数据库和生成的 Markdown 都在 Git 忽略目录中。对外或商用前，仍需核实版权、授权和资料是否仍然适用。
