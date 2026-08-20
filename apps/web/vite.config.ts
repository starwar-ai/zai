import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 智能抠图通过用户操作才动态加载。提前完成依赖优化，避免开发期间首次
  // 点击触发 Vite 重新优化依赖，导致当前页面仍引用已经失效的 ?v=... 地址。
  optimizeDeps: {
    include: ["@imgly/background-removal", "onnxruntime-web"],
  },
  server: {
    proxy: { "/api": "http://localhost:3100", "/health": "http://localhost:3100" },
  },
})
