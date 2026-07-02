// 판매 세션 상태 머신 테스트 — 투입/구매/배출/반환 (sales-mode A-2·A-3)
// TC-A01~A03, A07~A12, A16, A17, A19~A22, A24, INV-4
import { beforeEach, describe, expect, it } from 'vitest';
import { createMachine, findProduct, ledgerHolds } from '../domain/machine.js';
import { beginDispense, insert, refund, resolveDispense } from '../domain/session.js';
import { setQty } from '../domain/admin.js';
import type { Machine } from '../domain/types.js';

let m: Machine;
beforeEach(() => {
  m = createMachine();
});

/** 배출까지 한 번에 (테스트 헬퍼): 구매 → 판정 */
function buy(machine: Machine, id: string, success: boolean) {
  const b = beginDispense(machine, id);
  if (!b.ok) return b;
  return resolveDispense(machine, success);
}

describe('현금 투입 (A-3.2, INV-3)', () => {
  it('TC-A01: IDLE에서 1,000 투입 → 잔액 1000, ACTIVE', () => {
    const r = insert(m, 1000);
    expect(r.ok).toBe(true);
    expect(m.balance).toBe(1000);
    expect(m.state).toBe('ACTIVE');
  });

  it('TC-A02: 1000 후 500+100 → 잔액 1600', () => {
    insert(m, 1000);
    insert(m, 500);
    insert(m, 100);
    expect(m.balance).toBe(1600);
  });

  it('TC-A03/BR-A1: 허용 외 화폐(5000) 거부, 잔액 불변', () => {
    insert(m, 1000);
    const r = insert(m, 5000);
    expect(r.ok).toBe(false);
    expect(m.balance).toBe(1000);
  });
});

describe('구매 & 배출 성공 (A-3.3, TC-A07/A08)', () => {
  it('TC-A07: 잔액 1500, 콜라 성공 → 재고-1, 매출+1500, 잔액 0, IDLE(세션 종료)', () => {
    insert(m, 1000);
    insert(m, 500); // 1500
    const before = findProduct(m, 'cola')!.qty;
    buy(m, 'cola', true);
    expect(findProduct(m, 'cola')!.qty).toBe(before - 1);
    expect(m.revenue).toBe(1500);
    expect(m.balance).toBe(0);
    expect(m.state).toBe('IDLE');
    expect(m.purchaseCount).toBe(0); // TC-A22 세션 종료 시 카운트 초기화
  });

  it('TC-A08: 잔액 2000, 콜라 성공 → 잔액 500, ACTIVE(추가 구매)', () => {
    insert(m, 1000);
    insert(m, 1000);
    buy(m, 'cola', true);
    expect(m.balance).toBe(500);
    expect(m.state).toBe('ACTIVE');
    expect(m.purchaseCount).toBe(1);
  });
});

describe('구매 거부 (A-3.1, TC-A10/A11)', () => {
  it('TC-A10/BR-A2: 잔액 500에 콜라(1500) → 거부 INSUFFICIENT_BALANCE', () => {
    insert(m, 500);
    const r = beginDispense(m, 'cola');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INSUFFICIENT_BALANCE');
    expect(m.balance).toBe(500);
    expect(m.state).toBe('ACTIVE');
  });

  it('TC-A11/BR-A3: 생수 재고 0 → 거부 SOLD_OUT', () => {
    setQty(m, 'water', 0);
    insert(m, 1000);
    const r = beginDispense(m, 'water');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('SOLD_OUT');
  });
});

describe('배출 실패 (A-7.3, TC-A20/A21)', () => {
  it('TC-A20: 잔액 2000, 콜라(1500) 재고5 RNG=실패 → 미배출, 잔액 500 유지, 재고4, 매출불변, 미반환금+1500', () => {
    setQty(m, 'cola', 5);
    insert(m, 1000);
    insert(m, 1000);
    buy(m, 'cola', false);
    expect(findProduct(m, 'cola')!.qty).toBe(4); // 재고 -1
    expect(m.balance).toBe(500); // 복구 안 됨
    expect(m.revenue).toBe(0); // 매출 불변
    expect(m.unreturnedFail).toBe(1500); // 미반환금
    expect(m.state).toBe('ACTIVE');
  });

  it('TC-A21: 동일 상황 RNG=성공 → 재고4, 매출+1500, 잔액 500', () => {
    setQty(m, 'cola', 5);
    insert(m, 1000);
    insert(m, 1000);
    buy(m, 'cola', true);
    expect(findProduct(m, 'cola')!.qty).toBe(4);
    expect(m.revenue).toBe(1500);
    expect(m.balance).toBe(500);
  });
});

describe('프로모 할인 세션 (A-7.1, TC-A16/A17)', () => {
  it('TC-A16: 2회 구매 후 3번째 콜라 → 최종가 1000 청구, 매출+1000', () => {
    // 잔액 넉넉히 (물 500 x2 구매 후 콜라)
    for (let i = 0; i < 6; i++) insert(m, 1000); // 6000
    buy(m, 'water', true); // count1, -500 → 5500
    buy(m, 'water', true); // count2, -500 → 5000
    const revenueBefore = m.revenue;
    const b = beginDispense(m, 'cola'); // 3번째 → 프로모
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.effectivePrice).toBe(1000); // 1500 - 500
    resolveDispense(m, true);
    expect(m.revenue).toBe(revenueBefore + 1000);
  });

  it('TC-A17: 세션 종료 후 새 세션은 카운트 1부터 (할인 미적용)', () => {
    for (let i = 0; i < 6; i++) insert(m, 1000);
    buy(m, 'water', true);
    buy(m, 'water', true);
    buy(m, 'cola', true); // 3번째 프로모
    refund(m); // 세션 종료
    expect(m.purchaseCount).toBe(0);
    // 새 세션 첫 구매 → 할인 없음
    insert(m, 1000);
    insert(m, 1000);
    const b = beginDispense(m, 'cola');
    if (b.ok) expect(b.effectivePrice).toBe(1500);
  });
});

describe('동적+프로모 상쇄 결제 (TC-A19)', () => {
  it('재고 3(+500) 상품을 3번째 구매(−500) → 기본가 청구', () => {
    setQty(m, 'cola', 3);
    for (let i = 0; i < 6; i++) insert(m, 1000);
    buy(m, 'water', true);
    buy(m, 'water', true);
    const b = beginDispense(m, 'cola'); // 재고3 → 2가 됨? 아니: beginDispense는 재고 안 건드림
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.effectivePrice).toBe(1500); // 1500+500-500
  });
});

describe('반환 (A-3.4/A-3.5)', () => {
  it('TC-A09: 반환액 700 → 500×1+100×2, 세션 종료 IDLE', () => {
    insert(m, 500);
    insert(m, 100);
    insert(m, 100); // 700
    const r = refund(m);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amount).toBe(700);
      expect(r.breakdown).toEqual({ 1000: 0, 500: 1, 100: 2 });
    }
    expect(m.balance).toBe(0);
    expect(m.state).toBe('IDLE');
  });

  it('TC-A12: 잔액 1600 반환 버튼 → 즉시 반환, 세션 종료', () => {
    insert(m, 1000);
    insert(m, 500);
    insert(m, 100);
    const r = refund(m);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBe(1600);
    expect(m.state).toBe('IDLE');
  });

  it('TC-A15/BR-A4/A6-7: 100원 재고 0으로 700 정확 반환 불가 → 거부, 잔액·세션 유지', () => {
    m.coins = { 1000: 5, 500: 5, 100: 0 };
    insert(m, 500);
    insert(m, 100);
    insert(m, 100); // 700
    const r = refund(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INSUFFICIENT_CHANGE');
    expect(m.balance).toBe(700); // 유지
    expect(m.state).toBe('ACTIVE');
  });

  it('반환분만큼 자판기 잔돈 float 차감 (INV-6)', () => {
    insert(m, 500);
    const coinsBefore = m.coins[500];
    refund(m);
    expect(m.coins[500]).toBe(coinsBefore - 1);
  });
});

describe('금액 원장 보존 (INV-4, TC-A24)', () => {
  it('성공·실패·반환 섞인 세션에서 항상 원장 성립', () => {
    // 시나리오: 투입 5000 → 콜라 성공, 콜라 실패, 반환
    setQty(m, 'cola', 5);
    for (let i = 0; i < 5; i++) insert(m, 1000); // 5000
    expect(ledgerHolds(m)).toBe(true);
    buy(m, 'cola', true); // -1500 매출
    expect(ledgerHolds(m)).toBe(true);
    buy(m, 'cola', false); // -1500 미반환금
    expect(ledgerHolds(m)).toBe(true);
    refund(m); // 잔여 2000 반환
    expect(ledgerHolds(m)).toBe(true);
    // 세션 종료 형태: 투입 == 반환 + 매출 + 미반환금
    expect(m.totalInserted).toBe(m.totalReturned + m.revenue + m.unreturnedFail);
    expect(m.balance).toBe(0);
  });
});
