// 가격 계산 테스트 — 프로모(A-7.1)·동적가격(A-7.2)·최종가(A6-2)·구매가능(A-3.1)
// TC-A04~A06, A16~A19
import { describe, expect, it } from 'vitest';
import { computePrice, isPromoPurchase, purchasability } from '../domain/pricing.js';
import type { Product } from '../domain/types.js';

const cola = (qty: number): Product => ({ id: 'cola', name: '콜라', basePrice: 1500, qty, color: '#E74C3C' });

describe('computePrice — 동적 가격 (A-7.2)', () => {
  it('TC-A18: 재고 3 → +500 인상, 붉은색', () => {
    const p = computePrice(cola(3), 0);
    expect(p.effectivePrice).toBe(2000);
    expect(p.dynamicRaise).toBe(500);
    expect(p.color).toBe('raised');
  });

  it('재고 4(>3) → 인상 없음, 노란색', () => {
    const p = computePrice(cola(4), 0);
    expect(p.effectivePrice).toBe(1500);
    expect(p.dynamicRaise).toBe(0);
    expect(p.color).toBe('normal');
  });

  it('재고 3 경계 포함 (≤3 인상)', () => {
    expect(computePrice(cola(3), 0).dynamicRaise).toBe(500);
    expect(computePrice(cola(2), 0).dynamicRaise).toBe(500);
  });
});

describe('computePrice — 프로모 할인 (A-7.1, A6-3)', () => {
  it('isPromoPurchase: 카운트 2 → 다음(3번째)이 프로모', () => {
    expect(isPromoPurchase(2)).toBe(true); // 다음 구매 = 3번째
    expect(isPromoPurchase(0)).toBe(false);
    expect(isPromoPurchase(1)).toBe(false);
    expect(isPromoPurchase(5)).toBe(true); // 다음 = 6번째
  });

  it('TC-A16: 카운트 2에서 콜라(1500) → 최종가 1000 (−500)', () => {
    const p = computePrice(cola(8), 2);
    expect(p.effectivePrice).toBe(1000);
    expect(p.promoDiscount).toBe(500);
    expect(p.promoApplied).toBe(true);
  });
});

describe('computePrice — 인상+할인 상쇄 (A6-2, TC-A19)', () => {
  it('재고 3(+500) & 3번째 구매(−500) → 최종가 = 기본가(net 0)', () => {
    const p = computePrice(cola(3), 2);
    expect(p.effectivePrice).toBe(1500);
    expect(p.dynamicRaise).toBe(500);
    expect(p.promoDiscount).toBe(500);
    expect(p.color).toBe('raised'); // 인상 조건이므로 붉은색 (design-system §5.1)
  });

  it('최종가 하한 0 (max(0, ...))', () => {
    const cheap: Product = { id: 'x', name: 'x', basePrice: 100, qty: 8, color: '#000' };
    expect(computePrice(cheap, 2).effectivePrice).toBe(0); // 100 - 500 → 0
  });
});

describe('purchasability (A-3.1)', () => {
  it('TC-A06: 재고 0 → SOLD_OUT', () => {
    expect(purchasability(cola(0), 5000, 1500)).toBe('SOLD_OUT');
  });
  it('TC-A04: 잔액 0 → INSUFFICIENT', () => {
    expect(purchasability(cola(8), 0, 1500)).toBe('INSUFFICIENT');
  });
  it('TC-A05: 잔액 >= 최종가 → AVAILABLE', () => {
    expect(purchasability(cola(8), 1500, 1500)).toBe('AVAILABLE');
  });
});
