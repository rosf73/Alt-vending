// 상태 투영 — 프론트로 보낼 계산된 뷰 (R9: 프론트는 규칙 복제 금지).
// 최종가·구매가능·색상 등 파생값을 백엔드에서 계산해 내려준다.
import { coinsTotal } from './money.js';
import { evaluateProduct, isPromoPurchase } from './pricing.js';
import { ledgerHolds } from './machine.js';
import type { Machine, Purchasability } from './types.js';

export interface ProductView {
  id: string;
  name: string;
  basePrice: number;
  qty: number;
  color: string;
  effectivePrice: number;
  dynamicRaise: number;
  promoDiscount: number;
  promoApplied: boolean;
  /** 최종가 색상: 'raised'(붉은색) | 'normal'(노란색) — design-system §5.1 */
  priceColor: 'raised' | 'normal';
  purchasability: Purchasability;
}

export interface MachineView {
  state: Machine['state'];
  balance: number;
  purchaseCount: number;
  revenue: number;
  unreturnedFail: number;
  totalInserted: number;
  totalReturned: number;
  coins: Machine['coins'];
  coinsTotal: number;
  products: ProductView[];
  pendingDispense: Machine['pendingDispense'];
  /** 다음 구매가 프로모(3·6·9…) 대상인지 */
  nextIsPromo: boolean;
  /** INV-4 원장 성립 여부 (디버그/검증용) */
  ledgerOk: boolean;
}

/** Machine → 클라이언트 뷰로 투영 (파생값 포함). */
export function projectMachine(machine: Machine): MachineView {
  return {
    state: machine.state,
    balance: machine.balance,
    purchaseCount: machine.purchaseCount,
    revenue: machine.revenue,
    unreturnedFail: machine.unreturnedFail,
    totalInserted: machine.totalInserted,
    totalReturned: machine.totalReturned,
    coins: { ...machine.coins },
    coinsTotal: coinsTotal(machine.coins),
    pendingDispense: machine.pendingDispense,
    nextIsPromo: isPromoPurchase(machine.purchaseCount),
    ledgerOk: ledgerHolds(machine),
    products: machine.products.map((p) => {
      const e = evaluateProduct(machine, p);
      return {
        id: p.id,
        name: p.name,
        basePrice: p.basePrice,
        qty: p.qty,
        color: p.color,
        effectivePrice: e.effectivePrice,
        dynamicRaise: e.dynamicRaise,
        promoDiscount: e.promoDiscount,
        promoApplied: e.promoApplied,
        priceColor: e.color,
        purchasability: e.purchasability,
      };
    }),
  };
}
