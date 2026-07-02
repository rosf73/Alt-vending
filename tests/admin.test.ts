// 관리자 연산 테스트 — 재고/가격/상품/잔돈 (admin-mode B-3, BR-B4~B10)
// TC-B01~B09, B17~B19
import { beforeEach, describe, expect, it } from 'vitest';
import { createMachine, findProduct } from '../domain/machine.js';
import { addProduct, removeProduct, setBasePrice, setCoinCount, setQty } from '../domain/admin.js';
import type { Machine, Product } from '../domain/types.js';

let m: Machine;
beforeEach(() => {
  m = createMachine();
});

describe('재고 관리 (B-3.1)', () => {
  it('TC-B01: 초기 시드 콜라1500·사이다1200·생수500·커피1800', () => {
    expect(findProduct(m, 'cola')!.basePrice).toBe(1500);
    expect(findProduct(m, 'cider')!.basePrice).toBe(1200);
    expect(findProduct(m, 'water')!.basePrice).toBe(500);
    expect(findProduct(m, 'coffee')!.basePrice).toBe(1800);
  });

  it('TC-B02: 콜라 수량 5로 보충', () => {
    expect(setQty(m, 'cola', 5).ok).toBe(true);
    expect(findProduct(m, 'cola')!.qty).toBe(5);
  });

  it('TC-B04/BR-B4: 결과 음수(-3) 거부, 수량 불변', () => {
    setQty(m, 'cola', 2);
    const r = setQty(m, 'cola', -3); // 프론트가 2-5=-3 계산 후 시도
    expect(r.ok).toBe(false);
    expect(findProduct(m, 'cola')!.qty).toBe(2);
  });
});

describe('가격 변경 (BR-B6)', () => {
  it('TC-B05: 콜라 1500 → 1600', () => {
    expect(setBasePrice(m, 'cola', 1600).ok).toBe(true);
    expect(findProduct(m, 'cola')!.basePrice).toBe(1600);
  });

  it('TC-B06: 범위 밖(50, 10500) 거부, 값 불변', () => {
    expect(setBasePrice(m, 'cola', 50).ok).toBe(false);
    expect(setBasePrice(m, 'cola', 10500).ok).toBe(false);
    expect(findProduct(m, 'cola')!.basePrice).toBe(1500);
  });

  it('TC-B17: 경계값 100·10,000 허용', () => {
    expect(setBasePrice(m, 'cola', 100).ok).toBe(true);
    expect(setBasePrice(m, 'cola', 10000).ok).toBe(true);
  });
});

describe('상품 추가/제거 (BR-B10, 최대 9개)', () => {
  const mk = (id: string): Product => ({ id, name: id, basePrice: 1000, qty: 3, color: '#888' });

  it('TC-B19: 8개에서 9번째 추가 허용', () => {
    // 시드 4개 → 5개 추가로 9개
    for (let i = 0; i < 4; i++) addProduct(m, mk(`p${i}`));
    expect(m.products.length).toBe(8);
    expect(addProduct(m, mk('p9')).ok).toBe(true);
    expect(m.products.length).toBe(9);
  });

  it('TC-B18/BR-B10: 9개 상태에서 10번째 추가 거부', () => {
    for (let i = 0; i < 5; i++) addProduct(m, mk(`p${i}`)); // 9개
    expect(m.products.length).toBe(9);
    const r = addProduct(m, mk('overflow'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('MAX_PRODUCTS');
    expect(m.products.length).toBe(9);
  });

  it('id 중복 거부', () => {
    expect(addProduct(m, mk('cola')).ok).toBe(false);
  });

  it('removeProduct', () => {
    expect(removeProduct(m, 'cola').ok).toBe(true);
    expect(findProduct(m, 'cola')).toBeUndefined();
  });
});

describe('잔돈 관리 (B-3.2, BR-B5)', () => {
  it('TC-B08: 100원 개수 50으로 설정', () => {
    expect(setCoinCount(m, 100, 50).ok).toBe(true);
    expect(m.coins[100]).toBe(50);
  });

  it('TC-B09/BR-B5: 음수(-3) 거부', () => {
    m.coins[500] = 2;
    const r = setCoinCount(m, 500, -3); // 프론트 2-5=-3
    expect(r.ok).toBe(false);
    expect(m.coins[500]).toBe(2);
  });
});
