// 영속성 테스트 — INV-1 (재시작 후 상태 유지) / TC-A23, TC-B15
import { describe, expect, it } from 'vitest';
import { VendingStore } from '../persistence/store.js';
import { insert } from '../domain/session.js';

describe('VendingStore 영속성 (INV-1)', () => {
  it('최초 로드 시 시드 상태 (IDLE, 시드 상품 4종)', () => {
    const store = new VendingStore(':memory:');
    const m = store.load();
    expect(m.state).toBe('IDLE');
    expect(m.products.length).toBe(4);
    store.close();
  });

  it('TC-A23/TC-B15: persist 후 load 시 세션 잔액·카운트·재고 유지', () => {
    // ':memory:'는 커넥션별 격리 → 동일 store 인스턴스로 persist→load 검증
    const store = new VendingStore(':memory:');
    const m = store.load();
    insert(m, 1000);
    m.purchaseCount = 2;
    store.persist(m);

    const reloaded = store.load();
    expect(reloaded.balance).toBe(1000);
    expect(reloaded.purchaseCount).toBe(2);
    expect(reloaded.products.length).toBe(4);
    store.close();
  });
});
