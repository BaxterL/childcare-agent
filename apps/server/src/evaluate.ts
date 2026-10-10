import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createContext } from "@childcare/pipeline";
import { isEmergencyRequest, isInDomain, isMedicalRequest } from "./safety.js";
import { searchEvidence } from "./retrieval.js";

interface Case {
  id: string;
  question: string;
  kind: "retrieval" | "off_topic" | "medical" | "emergency";
  expectedTitle?: string;
}

const cases = JSON.parse(await readFile(resolve("data/eval/baseline.json"), "utf8")) as Case[];
const context = createContext();
let passed = 0;
const failures: string[] = [];

try {
  for (const item of cases) {
    const history: Array<{ role: "user"; content: string }> = [];
    const domain = isInDomain(item.question, history);
    const medical = isMedicalRequest(item.question);
    const emergency = isEmergencyRequest(item.question);
    let ok = false;
    if (item.kind === "off_topic") ok = !domain;
    else if (item.kind === "medical") ok = medical;
    else if (item.kind === "emergency") ok = emergency;
    else {
      const hits = searchEvidence(context, item.question, 5);
      ok = domain && !medical && hits.some((hit) => hit.title.includes(item.expectedTitle ?? ""));
    }
    if (ok) passed += 1;
    else failures.push(`${item.id}: ${item.question}`);
  }
} finally {
  context.db.close();
}

console.log(`基线评测：${passed}/${cases.length} 通过`);
if (failures.length) {
  for (const failure of failures) console.error(`  未通过：${failure}`);
  process.exitCode = 1;
}
