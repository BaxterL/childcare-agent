import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createContext } from "@childcare/pipeline";
import { isEmergencyRequest, isInDomain, isMedicalRequest } from "./safety.js";
import { searchEvidence } from "./retrieval.js";

type Kind = "retrieval" | "off_topic" | "medical" | "emergency";

interface Case {
  id: string;
  question: string;
  kind: Kind;
  expectedTitle?: string;
  expectedDocNo?: string;
}

interface CaseResult {
  id: string;
  question: string;
  kind: Kind;
  passed: boolean;
  detail: string;
}

const cases = JSON.parse(await readFile(resolve("data/eval/baseline.json"), "utf8")) as Case[];
const context = createContext();

const results: CaseResult[] = [];
let retrievalCaseCount = 0;
let citationReadyCount = 0;

try {
  for (const item of cases) {
    const history: Array<{ role: "user"; content: string }> = [];
    const domain = isInDomain(item.question, history);
    const medical = isMedicalRequest(item.question);
    const emergency = isEmergencyRequest(item.question);
    let passed = false;
    let detail = "";

    if (item.kind === "off_topic") {
      passed = !domain && !emergency;
      detail = `domain=${domain}`;
    } else if (item.kind === "medical") {
      passed = medical && !emergency;
      detail = `medical=${medical} emergency=${emergency}`;
    } else if (item.kind === "emergency") {
      passed = emergency;
      detail = `emergency=${emergency}`;
    } else {
      const hits = searchEvidence(context, item.question, 5);
      const titleHit = item.expectedTitle ? hits.some((hit) => hit.title.includes(item.expectedTitle!)) : true;
      const docNoHit = item.expectedDocNo ? hits.some((hit) => hit.documentNo?.includes(item.expectedDocNo!)) : true;
      const citationReady =
        hits.length > 0 && hits.every((hit) => Boolean(hit.title) && hit.pageNumber > 0 && Boolean(hit.section));
      retrievalCaseCount += 1;
      if (citationReady) citationReadyCount += 1;
      passed = domain && !medical && !emergency && titleHit && docNoHit;
      detail = `hits=${hits.length} titleHit=${titleHit} docNoHit=${docNoHit} citationReady=${citationReady}`;
    }

    results.push({ id: item.id, question: item.question, kind: item.kind, passed, detail });
  }
} finally {
  context.db.close();
}

const byKind: Record<Kind, { total: number; passed: number }> = {
  retrieval: { total: 0, passed: 0 },
  off_topic: { total: 0, passed: 0 },
  medical: { total: 0, passed: 0 },
  emergency: { total: 0, passed: 0 },
};
for (const item of results) {
  byKind[item.kind].total += 1;
  if (item.passed) byKind[item.kind].passed += 1;
}

const passed = results.filter((item) => item.passed).length;
const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed,
  passRate: Number((passed / results.length).toFixed(4)),
  retrievalRecallAt5: byKind.retrieval.total ? Number((byKind.retrieval.passed / byKind.retrieval.total).toFixed(4)) : 0,
  citationReadyRate: retrievalCaseCount ? Number((citationReadyCount / retrievalCaseCount).toFixed(4)) : 0,
  byKind,
  failures: results
    .filter((item) => !item.passed)
    .map(({ id, question, kind, detail }) => ({ id, question, kind, detail })),
};

await writeFile(resolve("data/eval/report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`基线评测：${passed}/${report.total} 通过（${(report.passRate * 100).toFixed(1)}%）`);
console.log(`  检索 Recall@5：${(report.retrievalRecallAt5 * 100).toFixed(1)}%    引用可溯源率：${(report.citationReadyRate * 100).toFixed(1)}%`);
for (const kind of Object.keys(byKind) as Kind[]) {
  console.log(`  ${kind.padEnd(10)} ${byKind[kind].passed}/${byKind[kind].total}`);
}
console.log("  报告：data/eval/report.json");
if (report.failures.length) {
  for (const failure of report.failures) {
    console.error(`  未通过：${failure.id}（${failure.kind}）${failure.detail}`);
  }
  process.exitCode = 1;
}
