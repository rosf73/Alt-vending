// 관리자 연산 — 재고/가격/상품/잔돈 관리 (admin-mode B-3, INV-6, BR-B4~B10)
// 모든 값은 절대값(인라인 편집·저장, design-system §5.5). 변경은 영속·실시간 반영(서버 계층).
import type { Denomination, Machine, Product } from './types.js';
import { MAX_BASE_PRICE, MAX_PRODUCTS, MIN_BASE_PRICE } from './pricing.js';
import { findProduct } from './machine.js';

export type AdminError =
  | 'NOT_FOUND'
  | 'NEGATIVE_QTY' // BR-B4
  | 'PRICE_OUT_OF_RANGE' // BR-B6
  | 'MAX_PRODUCTS' // BR-B10
  | 'NEGATIVE_COIN' // BR-B5
  | 'DUPLICATE_ID'
  | 'INVALID';

export type AdminResult = { ok: true } | { ok: false; error: AdminError };

/** 재고 수량 변경 (절대값). 결과 음수 불가 (BR-B4, INV-6). */
export function setQty(machine: Machine, productId: string, qty: number): AdminResult {
  const product = findProduct(machine, productId);
  if (!product) return { ok: false, error: 'NOT_FOUND' };
  if (!Number.isInteger(qty) || qty < 0) return { ok: false, error: 'NEGATIVE_QTY' };
  product.qty = qty;
  return { ok: true };
}

/** 기본가 변경. 100~99,999 범위(경계 포함, BR-B6). */
export function setBasePrice(machine: Machine, productId: string, price: number): AdminResult {
  const product = findProduct(machine, productId);
  if (!product) return { ok: false, error: 'NOT_FOUND' };
  if (!isValidPrice(price)) return { ok: false, error: 'PRICE_OUT_OF_RANGE' };
  product.basePrice = price;
  return { ok: true };
}

/** 상품 추가. 최대 9개 (BR-B10). 기본가 범위 검증(BR-B6). id 중복 불가. */
export function addProduct(machine: Machine, product: Product): AdminResult {
  if (machine.products.length >= MAX_PRODUCTS) return { ok: false, error: 'MAX_PRODUCTS' };
  if (!isValidPrice(product.basePrice)) return { ok: false, error: 'PRICE_OUT_OF_RANGE' };
  if (!Number.isInteger(product.qty) || product.qty < 0) return { ok: false, error: 'NEGATIVE_QTY' };
  if (findProduct(machine, product.id)) return { ok: false, error: 'DUPLICATE_ID' };
  machine.products.push({ ...product });
  return { ok: true };
}

/** 상품 제거. */
export function removeProduct(machine: Machine, productId: string): AdminResult {
  const idx = machine.products.findIndex((p) => p.id === productId);
  if (idx === -1) return { ok: false, error: 'NOT_FOUND' };
  machine.products.splice(idx, 1);
  return { ok: true };
}

/** 잔돈 개수 변경 (절대값). 결과 음수 불가 (BR-B5, INV-6). 보충/회수 공통. */
export function setCoinCount(machine: Machine, denom: Denomination, count: number): AdminResult {
  if (!Number.isInteger(count) || count < 0) return { ok: false, error: 'NEGATIVE_COIN' };
  machine.coins[denom] = count;
  return { ok: true };
}

/** 기본가 유효성 (§3.2, BR-B6, 경계 100·99,999 허용). */
export function isValidPrice(price: number): boolean {
  return Number.isInteger(price) && price >= MIN_BASE_PRICE && price <= MAX_BASE_PRICE;
}
