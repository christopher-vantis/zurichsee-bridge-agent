import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the Express backend during development
      // Frontend calls /api/chat → Vite forwards to http://localhost:3001/api/chat
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
