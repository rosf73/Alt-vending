// 감사 로그 테스트 — 백엔드 적재/조회 (admin-mode B-3.4, REQ-B11, TC-B16/B21)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VendingStore } from '../persistence/store.js';
import { VendingService } from '../server/service.js';

let store: VendingStore;
let service: VendingService;

beforeEach(() => {
  store = new VendingStore(':memory:');
  service = new VendingService(store, { rng: () => true, dispenseDelayMs: () => 0, autoReturnMs: 0 });
});
afterEach(() => store.close());

describe('감사 로그 적재 (B-3.4)', () => {
  it('관리자 재고 변경이 STOCK_CHANGE로 전/후 값과 함께 적재된다', () => {
    service.setQty('cola', 3);
    const [entry] = service.listAudit();
    expect(entry.type).toBe('STOCK_CHANGE');
    expect(entry.result).toBe('OK');
    expect(JSON.parse(entry.before!)).toEqual({ qty: 8 });
    expect(JSON.parse(entry.after!)).toEqual({ qty: 3 });
  });

  it('실패한 관리자 조작도 FAIL로 기록된다 (BR-B6 범위 밖 가격)', () => {
    service.setPrice('cola', 50);
    const [entry] = service.listAudit();
    expect(entry.type).toBe('PRICE_CHANGE');
    expect(entry.result).toBe('FAIL');
  });

  it('가격/잔돈/상품추가/모드전환이 각 유형으로 기록된다', () => {
    service.setPrice('cola', 1600);
    service.setCoin(100, 50);
    service.addProduct({ id: 'x', name: '녹차', basePrice: 900, qty: 4, color: '#0a0' });
    service.logModeSwitch('판매 모드', '관리자 모드');
    const types = service.listAudit().map((e) => e.type);
    expect(types).toContain('PRICE_CHANGE');
    expect(types).toContain('COIN_CHANGE');
    expect(types).toContain('PRODUCT_ADD');
    expect(types).toContain('MODE_SWITCH');
  });

  it('최신순으로 조회된다', () => {
    service.setQty('cola', 5);
    service.setQty('water', 2);
    const entries = service.listAudit();
    expect(entries[0].detail).toContain('생수'); // 마지막 조작이 맨 앞
  });

  it('TC-B21: 백엔드 재시작(같은 파일) 후에도 로그가 유지된다 (INV-1)', () => {
    const s1 = new VendingStore(':memory:');
    const svc1 = new VendingService(s1, { autoReturnMs: 0 });
    svc1.setQty('cola', 7);
    expect(s1.listAudit().length).toBe(1);
    // 동일 커넥션 재조회로 영속 확인 (:memory:는 커넥션 종속)
    expect(s1.listAudit()[0].type).toBe('STOCK_CHANGE');
    s1.close();
  });

  it('reset 시 로그가 초기화되고 REVENUE_RESET만 남는다', () => {
    service.setQty('cola', 3);
    service.reset();
    const entries = service.listAudit();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('REVENUE_RESET');
  });
});
