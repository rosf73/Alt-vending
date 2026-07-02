import { defineConfig } from 'vite';

// 프론트 진입점은 루트 index.html → /index.ts (하이브리드 §8.3.1).
// resources/ 이미지는 루트 기준 절대경로(/resources/…)로 서빙된다.
export default defineConfig({
  root: '.',
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      // 순수 vite dev(`npm run dev`) 사용 시 API를 백엔드로 프록시
      '/api': 'http://localhost:5174',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
