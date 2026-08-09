import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // When running `npm run dev`, run `netlify dev` instead (see README)
      // so this proxy target and the function are both served together.
      "/api": "http://localhost:8888",
    },
  },
});
