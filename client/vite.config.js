import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Đường dẫn tương đối để chạy được cả trên GitHub Pages (/<repo>/) lẫn khi server phục vụ
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
