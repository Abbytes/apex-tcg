import path from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.resolve("src/static");

export default defineConfig({
  root,
  base: "./",
  publicDir: false,
  envDir: path.resolve("."),
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@/game/online": path.resolve("src/static/online-stub.ts"),
      "@/lib/auth/gates": path.resolve("src/static/auth-stub.tsx"),
      "@/lib/auth/use-current-user": path.resolve("src/static/auth-stub.tsx"),
      "@/lib/auth/client": path.resolve("src/static/auth-stub.tsx"),
    },
  },
  define: {
    "import.meta.env.VITE_STATIC": JSON.stringify("1"),
    "import.meta.env.VITE_AUTH_ENABLED": JSON.stringify("false"),
  },
  build: {
    outDir: path.resolve("dist-apex"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
