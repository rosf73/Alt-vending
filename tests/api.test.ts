// HTTP API 통합 테스트 (Supertest) — 요청→상태변화→응답 계약 (§10.2)
// TC-A01/A03/A07/A10/A20/A21, TC-B02/B06/B18, INV-7(SSE)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { VendingService } from '../server/service.js';
import { VendingStore } from '../persistence/store.js';

let store: VendingStore;
let service: VendingService;
let app: ReturnType<typeof createApp>;

/** 배출 즉시 판정(delay 0) + RNG 주입 + 자동반환 비활성 서비스 */
function setup(rngSuccess: boolean) {
  store = new VendingStore(':memory:');
  service = new VendingService(store, {
    rng: () => rngSuccess,
    dispenseDelayMs: () => 0,
    autoReturnMs: 0,
  });
  app = createApp(service);
}

afterEach(() => store?.close());

describe('현금 투입 API', () => {
  beforeEach(() => setup(true));

  it('TC-A01: POST /api/insert 1000 → 잔액 1000, ACTIVE', async () => {
    const res = await request(app).post('/api/insert').send({ denom: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.state.balance).toBe(1000);
    expect(res.body.state.state).toBe('ACTIVE');
  });

  it('TC-A03: 허용 외 화폐 5000 → 400', async () => {
    const res = await request(app).post('/api/insert').send({ denom: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_DENOMINATION');
  });
});

describe('구매 & 배출 (delay 0)', () => {
  it('TC-A07/A21: RNG 성공 → 배출 완료 후 매출+1500, 재고-1', async () => {
    setup(true);
    await request(app).post('/api/insert').send({ denom: 1000 });
    await request(app).post('/api/insert').send({ denom: 1000 });
    const res = await request(app).post('/api/purchase').send({ productId: 'cola' });
    expect(res.status).toBe(200);
    expect(res.body.effectivePrice).toBe(1500);
    // delay 0 → 응답 시점엔 아직 DISPENSING일 수 있으니 최신 상태 재조회
    await new Promise((r) => setTimeout(r, 5));
    const state = (await request(app).get('/api/state')).body;
    expect(state.revenue).toBe(1500);
    expect(state.products.find((p: any) => p.id === 'cola').qty).toBe(7);
    expect(state.balance).toBe(500);
  });

  it('TC-A20: RNG 실패 → 미배출, 매출 불변, 미반환금+1500, 재고-1', async () => {
    setup(false);
    await request(app).post('/api/insert').send({ denom: 1000 });
    await request(app).post('/api/insert').send({ denom: 1000 });
    await request(app).post('/api/purchase').send({ productId: 'cola' });
    await new Promise((r) => setTimeout(r, 5));
    const state = (await request(app).get('/api/state')).body;
    expect(state.revenue).toBe(0);
    expect(state.unreturnedFail).toBe(1500);
    expect(state.products.find((p: any) => p.id === 'cola').qty).toBe(7);
    expect(state.balance).toBe(500);
    expect(state.ledgerOk).toBe(true); // INV-4
  });

  it('TC-A10: 잔액 부족 구매 → 400 INSUFFICIENT_BALANCE', async () => {
    setup(true);
    await request(app).post('/api/insert').send({ denom: 500 });
    const res = await request(app).post('/api/purchase').send({ productId: 'cola' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INSUFFICIENT_BALANCE');
  });
});

describe('관리자 API', () => {
  beforeEach(() => setup(true));

  it('TC-B02: 수량 저장', async () => {
    const res = await request(app).post('/api/admin/products/cola/qty').send({ qty: 5 });
    expect(res.status).toBe(200);
    expect(res.body.state.products.find((p: any) => p.id === 'cola').qty).toBe(5);
  });

  it('TC-B06: 범위 밖 가격 거부', async () => {
    expect((await request(app).post('/api/admin/products/cola/price').send({ price: 50 })).status).toBe(400);
    expect((await request(app).post('/api/admin/products/cola/price').send({ price: 100000 })).status).toBe(400);
  });

  it('TC-B18: 9개 초과 상품 추가 거부', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/admin/products').send({ id: `p${i}`, name: `p${i}`, basePrice: 1000, qty: 1 });
    }
    const res = await request(app).post('/api/admin/products').send({ id: 'x', name: 'x', basePrice: 1000, qty: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MAX_PRODUCTS');
  });

  it('잔돈 음수 회수 거부 (BR-B5)', async () => {
    const res = await request(app).post('/api/admin/coins/500').send({ count: -1 });
    expect(res.status).toBe(400);
  });
});

describe('실시간 동기화 SSE (INV-7)', () => {
  beforeEach(() => setup(true));

  it('TC-A28/A29: 상태 변경이 SSE로 push된다', async () => {
    // SSE 스트림 연결 후 관리자가 재고 변경 → 이벤트 수신 확인
    const chunks: string[] = [];
    const req = request(app)
      .get('/api/events')
      .buffer(false)
      .parse((res, cb) => {
        res.on('data', (c: Buffer) => {
          chunks.push(c.toString());
          if (chunks.join('').includes('"qty":3')) cb(null, Buffer.from(''));
        });
        res.on('end', () => cb(null, Buffer.from('')));
      });
    const done = req.then(() => {});
    await new Promise((r) => setTimeout(r, 20));
    await request(app).post('/api/admin/products/cola/qty').send({ qty: 3 });
    await Promise.race([done, new Promise((r) => setTimeout(r, 300))]);
    const all = chunks.join('');
    expect(all).toContain('data:');
    expect(all).toContain('"qty":3');
  });
});
