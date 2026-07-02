// 가격 계산 — 특별 BM: 프로모 할인(A-7.1), 동적 가격(A-7.2), 최종가(§3.5·A6-2)
// 구매 가능 여부(A-3.1). 순수 함수 — 상태 변경 없음 (R9 도메인 단일 출처).
import type { Machine, PriceInfo, Product, Purchasability } from './types.js';

/** 동적 인상 기준: 재고 ≤3 (A-7.2) */
export const DYNAMIC_RAISE_THRESHOLD = 3;
export const DYNAMIC_RAISE_AMOUNT = 500;
export const PROMO_DISCOUNT_AMOUNT = 500;
/** 프로모 주기: 3·6·9…번째 구매 (A-7.1) */
export const PROMO_EVERY = 3;

/** 상품 기본가 허용 범위 (§3.2, BR-B6, 경계 포함) */
export const MIN_BASE_PRICE = 100;
export const MAX_BASE_PRICE = 99_999;
/** 최대 상품 개수 (§3.2, BR-B10 — 3×3 그리드) */
export const MAX_PRODUCTS = 9;

/**
 * 다음 구매가 프로모(3의 배수) 대상인지 (A6-3: 세션 결제 횟수 기준).
 * 다음 구매 번호 = 현재 카운트 + 1.
 */
export function isPromoPurchase(purchaseCount: number): boolean {
  return (purchaseCount + 1) % PROMO_EVERY === 0;
}

/**
 * 상품 최종가/표시 정보 산정 (A-7.2).
 * 최종가 = max(0, 기본가 + 동적인상 − 프로모할인). 둘 다 해당 시 상쇄(A6-2).
 * 색상: 동적 인상 시 붉은색('raised'), 평상시 노란색('normal') (design-system §5.1).
 * @param purchaseCount 현재 세션 구매 카운트 (다음 구매 기준으로 프로모 판단)
 */
export function computePrice(product: Product, purchaseCount: number): PriceInfo {
  const dynamicRaise = product.qty <= DYNAMIC_RAISE_THRESHOLD ? DYNAMIC_RAISE_AMOUNT : 0;
  const promoApplied = isPromoPurchase(purchaseCount);
  const promoDiscount = promoApplied ? PROMO_DISCOUNT_AMOUNT : 0;
  const effectivePrice = Math.max(0, product.basePrice + dynamicRaise - promoDiscount);
  return {
    basePrice: product.basePrice,
    dynamicRaise,
    promoDiscount,
    effectivePrice,
    color: dynamicRaise > 0 ? 'raised' : 'normal',
    promoApplied,
  };
}

/**
 * 구매 가능 여부 (A-3.1):
 * - 재고 0 → 품절(SOLD_OUT)
 * - 잔액 < 최종가 → 금액 부족(INSUFFICIENT)
 * - 그 외 → 구매 가능(AVAILABLE)
 */
export function purchasability(product: Product, balance: number, effectivePrice: number): Purchasability {
  if (product.qty <= 0) return 'SOLD_OUT';
  if (balance < effectivePrice) return 'INSUFFICIENT';
  return 'AVAILABLE';
}

/** 특정 상품의 현재 가격+구매가능여부 (판매 화면 그리드용, machine 상태 기반) */
export function evaluateProduct(machine: Machine, product: Product) {
  const price = computePrice(product, machine.purchaseCount);
  return {
    ...price,
    purchasability: purchasability(product, machine.balance, price.effectivePrice),
  };
}
