// 판매 세션 상태 머신 — 투입/구매/배출/반환 (sales-mode A-2·A-3, INV-3·4·5·6)
// machine 객체를 원자적으로 변경한다 (아키텍처 §5.4). 서버가 연산을 직렬화한다 (INV-2).
import { INSERTABLE, type CoinFloat, type Denomination, type Machine } from './types.js';
import { computePrice, purchasability } from './pricing.js';
import { makeChange, subtractCoins } from './money.js';
import { findProduct } from './machine.js';

export type RefundResult =
  | { ok: true; amount: number; breakdown: CoinFloat }
  | { ok: false; error: OpError };

export type OpError =
  | 'INVALID_DENOMINATION' // BR-A1
  | 'BUSY' // 배출/반환 중 조작 불가
  | 'NOT_FOUND'
  | 'SOLD_OUT' // BR-A3
  | 'INSUFFICIENT_BALANCE' // BR-A2
  | 'NOT_DISPENSING'
  | 'INSUFFICIENT_CHANGE'; // BR-A4 / A6-7

/**
 * 현금 투입 (A-3.2, INV-3). 허용 외 화폐는 거부하고 상태 불변 (BR-A1).
 * 성공 시 잔액 증가·상태 ACTIVE. 배출/반환 중(transient)에는 투입 거부(BUSY).
 * 투입한 화폐는 자판기 잔돈 보유량(float)에 편입되어 관리자 잔돈·거스름돈 가용성에 반영된다
 * (A6-8 결정: 실제 자판기처럼 투입 화폐가 반환 재원이 됨).
 * 자동 반환 타이머 리셋(BR-A7)은 서버/프론트 타이머 계층 책임.
 */
export function insert(
  machine: Machine,
  denom: number,
): { ok: true; balance: number } | { ok: false; error: OpError } {
  if (!INSERTABLE.includes(denom as Denomination)) {
    return { ok: false, error: 'INVALID_DENOMINATION' };
  }
  if (machine.state === 'DISPENSING' || machine.state === 'RETURNING') {
    return { ok: false, error: 'BUSY' };
  }
  machine.balance += denom;
  machine.totalInserted += denom;
  machine.coins[denom as Denomination] += 1; // 투입 화폐가 잔돈 보유량에 편입 (관리자 잔돈 반영)
  machine.state = 'ACTIVE';
  return { ok: true, balance: machine.balance };
}

/**
 * 구매 확정 → 배출 시작 (A-3.3 step 1~3). 원자적 결제.
 * 최종가 검증(품절/금액부족) → 잔액 차감 → 구매 카운트 +1 → 상태 DISPENSING.
 * 실제 배출 판정은 1~2초 후 resolveDispense (서버 타이머).
 */
export function beginDispense(
  machine: Machine,
  productId: string,
): { ok: true; effectivePrice: number } | { ok: false; error: OpError } {
  if (machine.state !== 'ACTIVE') return { ok: false, error: 'BUSY' };
  const product = findProduct(machine, productId);
  if (!product) return { ok: false, error: 'NOT_FOUND' };

  const price = computePrice(product, machine.purchaseCount);
  const buyable = purchasability(product, machine.balance, price.effectivePrice);
  if (buyable === 'SOLD_OUT') return { ok: false, error: 'SOLD_OUT' };
  if (buyable === 'INSUFFICIENT') return { ok: false, error: 'INSUFFICIENT_BALANCE' };

  // 결제 (원자적, INV-4): 잔액 차감 + 구매 카운트 증가 (배출 실패도 결제로 카운트, A6-3)
  machine.balance -= price.effectivePrice;
  machine.purchaseCount += 1;
  machine.state = 'DISPENSING';
  machine.pendingDispense = { productId, effectivePrice: price.effectivePrice };
  return { ok: true, effectivePrice: price.effectivePrice };
}

/**
 * 배출 판정 결과 적용 (A-3.3 step 4~5, A-7.3).
 * 성공/실패 모두 재고 -1. 성공: 매출 += 최종가. 실패: 미반환금 += 최종가(결제액 미반환).
 * 이후 잔액>0 → ACTIVE(추가 구매), 잔액 0 → IDLE(세션 종료·카운트 초기화 BR-A12).
 * @param success 배출 성공 여부 (RNG는 서버가 주입, A6-6)
 */
export function resolveDispense(
  machine: Machine,
  success: boolean,
): { ok: true; success: boolean } | { ok: false; error: OpError } {
  if (machine.state !== 'DISPENSING' || !machine.pendingDispense) {
    return { ok: false, error: 'NOT_DISPENSING' };
  }
  const { productId, effectivePrice } = machine.pendingDispense;
  const product = findProduct(machine, productId);
  if (product) product.qty = Math.max(0, product.qty - 1); // 재고 -1 (INV-6)

  if (success) {
    machine.revenue += effectivePrice; // 배출 성공만 매출 (B-3.3)
  } else {
    machine.unreturnedFail += effectivePrice; // 미반환금 (INV-4, A-7.3)
  }

  machine.pendingDispense = null;
  endSessionIfDrained(machine); // 잔액 0이면 세션 종료, 아니면 ACTIVE
  return { ok: true, success };
}

/**
 * 잔여 잔액 반환 & 세션 종료 (A-3.4·A-3.5). 수동/자동/세션종료 공통 경로.
 * 최소 개수 잔돈(INV-5). 잔액 0이면 no-op(빈 반환). 상태 IDLE·카운트 초기화.
 * 거스름돈 부족(BR-A4) 시 [A6-7 결정] 잔액·세션을 유지하고 반환하지 않는다(INV-4 보존).
 */
export function refund(machine: Machine): RefundResult {
  if (machine.state === 'DISPENSING') return { ok: false, error: 'BUSY' };
  const amount = machine.balance;
  if (amount === 0) {
    machine.state = 'IDLE';
    machine.purchaseCount = 0;
    return { ok: true, amount: 0, breakdown: { 1000: 0, 500: 0, 100: 0 } };
  }
  const change = makeChange(amount, machine.coins);
  if (!change.ok) {
    // A6-7: 정확 반환 불가 → 잔액/세션 유지, 반환 거부 (돈 손실 없음, INV-4 보존)
    return { ok: false, error: 'INSUFFICIENT_CHANGE' };
  }
  machine.coins = subtractCoins(machine.coins, change.breakdown); // 반환분 float 차감 (INV-6)
  machine.totalReturned += amount;
  machine.balance = 0;
  machine.purchaseCount = 0; // 세션 종료 초기화 (BR-A12)
  machine.state = 'IDLE';
  return { ok: true, amount, breakdown: change.breakdown };
}

/** 잔액이 0이면 세션 종료(IDLE·카운트 초기화 BR-A12·A12), 아니면 ACTIVE (A-2.1). */
function endSessionIfDrained(machine: Machine): void {
  if (machine.balance <= 0) {
    machine.balance = 0;
    machine.purchaseCount = 0;
    machine.state = 'IDLE';
  } else {
    machine.state = 'ACTIVE';
  }
}
