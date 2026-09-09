import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const port = Number(env.VITE_DEV_PORT || 5173);
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || 4000}`;

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
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
      port,
      strictPort: true,
    },
  };
});
