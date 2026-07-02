// 화폐/잔돈 계산 — INV-5(최소 개수), §3.1(탐욕적 greedy), BR-A4(거스름돈 부족)
import { CHANGE_UNITS, type CoinFloat, type Denomination } from './types.js';

/** 잔돈 float 총 환산액 (admin B-3.2 총액 표시) */
export function coinsTotal(coins: CoinFloat): number {
  return (CHANGE_UNITS as Denomination[]).reduce((sum, unit) => sum + unit * coins[unit], 0);
}

export type ChangeResult =
  | { ok: true; breakdown: CoinFloat }
  | { ok: false; reason: 'INSUFFICIENT_CHANGE' };

/**
 * 최소 개수 잔돈 계산 (INV-5). 큰 단위부터 보유량 한도 내에서 탐욕적 차감(§3.1).
 * 100원이 모든 금액의 약수이므로 이 화폐 집합에서 greedy는 최소 개수이자 완전하다.
 * 정확히 만들 수 없으면 실패 (BR-A4 → 거스름돈 부족). 순수 함수 — 인자를 변경하지 않는다.
 * @param amount  반환할 금액 (100의 배수 가정, INV-3)
 * @param coins   자판기 보유 잔돈
 */
export function makeChange(amount: number, coins: CoinFloat): ChangeResult {
  if (amount < 0) return { ok: false, reason: 'INSUFFICIENT_CHANGE' };
  const breakdown: CoinFloat = { 1000: 0, 500: 0, 100: 0 };
  let remaining = amount;
  for (const unit of CHANGE_UNITS) {
    const need = Math.floor(remaining / unit);
    const use = Math.min(need, coins[unit]);
    breakdown[unit] = use;
    remaining -= use * unit;
  }
  if (remaining !== 0) return { ok: false, reason: 'INSUFFICIENT_CHANGE' };
  return { ok: true, breakdown };
}

/** float에서 breakdown 만큼 차감한 새 float 반환 (INV-6: 음수 방지는 makeChange가 보장) */
export function subtractCoins(coins: CoinFloat, breakdown: CoinFloat): CoinFloat {
  return {
    1000: coins[1000] - breakdown[1000],
    500: coins[500] - breakdown[500],
    100: coins[100] - breakdown[100],
  };
}
