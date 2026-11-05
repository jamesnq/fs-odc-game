import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mã phiên bản của bản build: dùng để báo người dùng khi có bản deploy mới.
// Được nhúng vào bundle (__APP_VERSION__) và ghi ra dist/version.json để server đọc.
const APP_VERSION = process.env.APP_VERSION || new Date().toISOString();

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'app-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
      },
    },
  ],
  define: {
    // Khi chạy dev (vite serve) không có version → không bao giờ báo cập nhật
    __APP_VERSION__: JSON.stringify(command === 'build' ? APP_VERSION : ''),
  },
  // Đường dẫn tương đối để chạy được cả trên GitHub Pages (/<repo>/) lẫn khi server phục vụ
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
}));
