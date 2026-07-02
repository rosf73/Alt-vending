// 서버 엔트리 — API + SSE + 프론트 호스팅 (단일 포트, 무선랜에서 심사위원 접속).
// dev: Vite 미들웨어(HMR). prod: dist/ 정적 서빙 (npm run build 후).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { VendingService } from './service.js';
import { VendingStore } from '../persistence/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 5173);
const isProd = process.env.NODE_ENV === 'production';

// RNG/타이밍은 E2E를 위해 env로 주입 가능 (A6-6)
const rngEnv = process.env.VENDING_RNG;
const store = new VendingStore(process.env.VENDING_DB ?? path.join(ROOT, 'vending.db'));
const service = new VendingService(store, {
  rng: rngEnv === 'success' ? () => true : rngEnv === 'fail' ? () => false : undefined,
  dispenseDelayMs: process.env.VENDING_DISPENSE_MS ? () => Number(process.env.VENDING_DISPENSE_MS) : undefined,
  autoReturnMs: process.env.VENDING_AUTORETURN_MS ? Number(process.env.VENDING_AUTORETURN_MS) : undefined,
});

const app = createApp(service);

async function start() {
  if (isProd) {
    // 빌드된 프론트 정적 서빙
    app.use(express.static(path.join(ROOT, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
  } else {
    // Vite 미들웨어 (HMR)
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: ROOT,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, () => {
    console.log(`🥤 자판기 시뮬레이터: http://localhost:${PORT}  (mode=${isProd ? 'prod' : 'dev'})`);
  });
}

start();
