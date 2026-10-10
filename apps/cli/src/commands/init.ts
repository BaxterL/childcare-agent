import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { createContext } from "@childcare/pipeline";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("初始化 data 目录与 SQLite 数据库")
    .action(() => {
      const ctx = createContext();
      const dataRoot = dirname(ctx.config.rawDir);
      const dirs = ["raw", "staging", "processed", "manifests", "eval", "releases"];
      for (const dir of dirs) {
        mkdirSync(join(dataRoot, dir), { recursive: true });
      }
      console.log("初始化完成：");
      console.log(`  数据库      ${ctx.config.dbPath}`);
      console.log(`  原始资料    ${ctx.config.rawDir}`);
      console.log(`  data 子目录 ${dirs.join(", ")}`);
      ctx.db.close();
    });
}
