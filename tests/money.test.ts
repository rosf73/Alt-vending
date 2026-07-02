// 잔돈 최소 개수 계산 테스트 — INV-5, §3.1, BR-A4 / TC-A09
import { describe, expect, it } from 'vitest';
import { coinsTotal, makeChange, subtractCoins } from '../domain/money.js';
import type { CoinFloat } from '../domain/types.js';

const abundant: CoinFloat = { 1000: 10, 500: 10, 100: 20 };

describe('makeChange (INV-5 최소 개수)', () => {
  it('TC-A09: 반환액 700 → 500×1 + 100×2 (총 3개, 최소 개수)', () => {
    const r = makeChange(700, abundant);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.breakdown).toEqual({ 1000: 0, 500: 1, 100: 2 });
  });

  it('A-5 예시: 2,300 → 1000×2 + 100×3', () => {
    const r = makeChange(2300, abundant);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.breakdown).toEqual({ 1000: 2, 500: 0, 100: 3 });
  });

  it('0원은 빈 breakdown', () => {
    const r = makeChange(0, abundant);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.breakdown).toEqual({ 1000: 0, 500: 0, 100: 0 });
  });

  it('큰 단위 부족 시 작은 단위로 대체 (1000×0, 500·100 사용)', () => {
    const r = makeChange(1000, { 1000: 0, 500: 1, 100: 20 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.breakdown).toEqual({ 1000: 0, 500: 1, 100: 5 });
  });

  it('TC-A15/BR-A4: 100원 재고 0으로 정확 반환 불가 → 실패', () => {
    const r = makeChange(700, { 1000: 5, 500: 5, 100: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INSUFFICIENT_CHANGE');
  });

  it('보유 잔돈으로 만들 수 없으면 실패 (총액 부족)', () => {
    const r = makeChange(2000, { 1000: 1, 500: 1, 100: 2 }); // max 1700
    expect(r.ok).toBe(false);
  });
});

describe('coinsTotal / subtractCoins', () => {
  it('TC-B07: 100×10,500×5,1000×3 → 총액 6,500', () => {
    expect(coinsTotal({ 1000: 3, 500: 5, 100: 10 })).toBe(6500);
  });

  it('subtractCoins는 breakdown만큼 차감', () => {
    expect(subtractCoins({ 1000: 10, 500: 10, 100: 20 }, { 1000: 2, 500: 0, 100: 3 })).toEqual({
      1000: 8,
      500: 10,
      100: 17,
    });
  });
});
