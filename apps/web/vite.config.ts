import { defineConfig } from "vite";

// Сборка одного IIFE-бандла. React/ReactDOM — внешние глобалы (UMD с cdnjs в артефакте).
export default defineConfig({
  oxc: { jsx: { runtime: "classic" } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: true,
    assetsInlineLimit: 0,
    lib: { entry: "src/main.tsx", formats: ["iife"], name: "FitnessApp", fileName: () => "app.js" },
    rollupOptions: {
      external: ["react", "react-dom", "react-dom/client"],
      output: { globals: { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" }, assetFileNames: "app.[ext]" },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
} as any);
