import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repoRoot, ""), ...process.env };
  const host = env.VITE_DEV_HOST || "127.0.0.1";
  const port = Number(env.VITE_DEV_PORT || 5173);
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || 4000}`;
  const base = env.VITE_HTTP_PREFIX
    ? `${env.VITE_HTTP_PREFIX.replace(/\/$/, "")}/`
    : "/";

  return {
    envDir: repoRoot,
    base,
    plugins: [react(), tailwindcss()],
    server: {
      host,
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host,
      port,
      strictPort: true,
    },
  };
});
