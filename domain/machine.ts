// 자판기 상태 factory·시드·불변식 헬퍼 — §3.2(시드), INV-1(영속 대상), INV-4(원장)
import type { CoinFloat, Machine, Product } from './types.js';

/** 예제 상품 시드 (§3.2). 색상은 배출 큐브 구분용 (design-system §5.10). */
export function seedProducts(): Product[] {
  return [
    { id: 'cola', name: '콜라', basePrice: 1500, qty: 8, color: '#E74C3C' },
    { id: 'cider', name: '사이다', basePrice: 1200, qty: 5, color: '#27AE60' },
    { id: 'water', name: '생수', basePrice: 500, qty: 10, color: '#2F80ED' },
    { id: 'coffee', name: '커피', basePrice: 1800, qty: 6, color: '#8B5E3C' },
  ];
}

/**
 * 초기 잔돈 float 시드 (§11.1.4). 요구사항에 초기값 미명시 → 반환 여유가 충분한
 * 합리적 기본값으로 정함 (R7 기록: sales-mode A6-7 관련). 관리자가 보충/회수 가능.
 */
export function seedCoins(): CoinFloat {
  return { 1000: 10, 500: 10, 100: 20 };
}

/** 초기 자판기 상태 (IDLE, 잔액 0). */
export function createMachine(): Machine {
  return {
    products: seedProducts(),
    coins: seedCoins(),
    revenue: 0,
    unreturnedFail: 0,
    balance: 0,
    purchaseCount: 0,
    state: 'IDLE',
    totalInserted: 0,
    totalReturned: 0,
    pendingDispense: null,
  };
}

export function findProduct(machine: Machine, productId: string): Product | undefined {
  return machine.products.find((p) => p.id === productId);
}

/**
 * 금액 원장 보존 (INV-4). 항상 성립해야 하는 항등식:
 *   투입 총액 = 잔액 + 반환 총액 + 매출 + 배출 실패 미반환금
 * 세션 종료(잔액 0) 시 spec §2 형태 `투입=반환+매출+미반환`로 환원된다 (TC-A24).
 */
export function ledgerHolds(machine: Machine): boolean {
  return (
    machine.totalInserted ===
    machine.balance + machine.totalReturned + machine.revenue + machine.unreturnedFail
  );
}
