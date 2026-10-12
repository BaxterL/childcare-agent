import fs from "node:fs";
import path from "node:path";
import { defineConfig, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const httpsDev = process.env.CHILDCARE_DEV_HTTPS === "1" || process.env.npm_lifecycle_event === "dev:web:https";
const certDir = fileURLToPath(new URL("./.certs/", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue() as unknown as PluginOption],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:4174" },
    https: httpsDev
      ? {
          pfx: fs.readFileSync(path.join(certDir, "dev.pfx")),
          passphrase: fs.readFileSync(path.join(certDir, "passphrase.txt"), "utf8").trim(),
        }
      : undefined,
  },
  build: { outDir: "dist", emptyOutDir: true },
});
