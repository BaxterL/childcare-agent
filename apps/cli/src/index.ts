#!/usr/bin/env node
import { Command } from "commander";
import { registerCollect } from "./commands/collect.js";
import { registerEmbed } from "./commands/embed.js";
import { registerInspect } from "./commands/inspect.js";
import { registerImport } from "./commands/import.js";
import { registerInit } from "./commands/init.js";
import { registerReindex } from "./commands/reindex.js";
import { registerSource } from "./commands/source.js";

const program = new Command();
program
  .name("childcare")
  .description("托育知护 · 数据收集与知识库维护 CLI")
  .version("0.1.0");

registerInit(program);
registerSource(program);
registerImport(program);
registerCollect(program);
registerInspect(program);
registerReindex(program);
registerEmbed(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
