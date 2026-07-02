// Express 앱 (API + SSE) — 상태 변경 명령은 REST, 실시간 동기화는 SSE (스택 §8.1).
// 라우트는 도메인 호출 + 직렬화만 담당 (아키텍처: 관심사 분리). Supertest 검증 대상.
import express, { type Express } from 'express';
import type { Denomination } from '../domain/types.js';
import type { VendingService } from './service.js';

const CHANGE_UNITS = [100, 500, 1000];

export function createApp(service: VendingService): Express {
  const app = express();
  app.use(express.json());

  /** 공통 응답: 성공 시 최신 상태 동봉, 실패 시 400 + error. */
  const respond = (res: express.Response, r: { ok: true } | { ok: false; error: string }) => {
    if (r.ok) res.json({ ok: true, state: service.view() });
    else res.status(400).json({ ok: false, error: r.error });
  };

  // 초기 로드/새로고침용 전체 상태 (INV-1)
  app.get('/api/state', (_req, res) => res.json(service.view()));

  // 실시간 동기화 채널 (INV-7): 연결 시 현재 상태 push, 이후 변경마다 push
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (view: unknown) => res.write(`data: ${JSON.stringify(view)}\n\n`);
    send(service.view());
    const unsub = service.subscribe(send);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      unsub();
    });
  });

  // ── 판매 ──
  app.post('/api/insert', (req, res) => {
    const denom = Number(req.body?.denom);
    respond(res, service.insert(denom));
  });

  app.post('/api/purchase', (req, res) => {
    const productId = String(req.body?.productId ?? '');
    const r = service.purchase(productId);
    if (r.ok) return res.json({ ok: true, effectivePrice: r.effectivePrice, state: service.view() });
    return res.status(400).json({ ok: false, error: r.error });
  });

  app.post('/api/refund', (_req, res) => {
    const r = service.refund();
    if (r.ok) return res.json({ ok: true, amount: r.amount, breakdown: r.breakdown, state: service.view() });
    return res.status(400).json({ ok: false, error: r.error });
  });

  // ── 관리자 ──
  app.post('/api/admin/products/:id/qty', (req, res) => {
    respond(res, service.setQty(req.params.id, Number(req.body?.qty)));
  });

  app.post('/api/admin/products/:id/price', (req, res) => {
    respond(res, service.setPrice(req.params.id, Number(req.body?.price)));
  });

  app.post('/api/admin/products', (req, res) => {
    const b = req.body ?? {};
    const product = {
      id: String(b.id ?? `p_${Date.now()}`),
      name: String(b.name ?? ''),
      basePrice: Number(b.basePrice),
      qty: Number(b.qty ?? 0),
      color: String(b.color ?? '#888888'),
    };
    respond(res, service.addProduct(product));
  });

  app.delete('/api/admin/products/:id', (req, res) => {
    respond(res, service.removeProduct(req.params.id));
  });

  app.post('/api/admin/coins/:denom', (req, res) => {
    const denom = Number(req.params.denom);
    if (!CHANGE_UNITS.includes(denom)) {
      res.status(400).json({ ok: false, error: 'INVALID_DENOMINATION' });
      return;
    }
    respond(res, service.setCoin(denom as Denomination, Number(req.body?.count)));
  });

  app.post('/api/admin/reset', (_req, res) => {
    service.reset();
    res.json({ ok: true, state: service.view() });
  });

  // ── 감사 로그 (REQ-B11) ──
  app.get('/api/audit', (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    res.json({ ok: true, entries: service.listAudit(limit) });
  });

  // 모드 전환 기록 (B-3.4) — 상태 변경 없이 로그만 적재
  app.post('/api/audit/mode-switch', (req, res) => {
    service.logModeSwitch(String(req.body?.from ?? ''), String(req.body?.to ?? ''));
    res.json({ ok: true });
  });

  return app;
}
