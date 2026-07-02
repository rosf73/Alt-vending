// 도메인 타입 정의 — 순수 도메인 (UI/DB 무관), spec §4 용어 / sales-mode A-2 상태 모델
// 근거: INV-3(화폐 제한), A-2.3(세션 상태), INV-4(원장), A-7(특별 BM)

/** 투입/반환 가능한 화폐 액면가 (INV-3, §3.1) */
export type Denomination = 100 | 500 | 1000;

/** 투입 가능 화폐 (§3.1) */
export const INSERTABLE: readonly Denomination[] = [100, 500, 1000] as const;

/** 잔돈 반환 단위 — 큰 단위부터 (§3.1, INV-5 greedy) */
export const CHANGE_UNITS: readonly Denomination[] = [1000, 500, 100] as const;

/** 자판기가 보유한 잔돈 float — 화폐 단위별 개수 (admin B-3.2 관리, 반환용 reserve) */
export type CoinFloat = Record<Denomination, number>;

/** 세션 상태 (sales-mode A-2.3) */
export type SessionState = 'IDLE' | 'ACTIVE' | 'DISPENSING' | 'RETURNING';

/** 상품 (§3.2, admin B-3.1) */
export interface Product {
  id: string;
  name: string;
  /** 기본가 — 관리자가 관리 (100~99,999, BR-B6) */
  basePrice: number;
  /** 재고 수량 (INV-6: 0 미만 불가) */
  qty: number;
  /** 배출 큐브 색 (design-system §5.10) */
  color: string;
}

/**
 * 자판기 단일 공유 상태 (INV-2). 영속 저장 대상 (INV-1).
 * 도메인 연산은 이 객체를 원자적으로 변경한다 (아키텍처 §5.4).
 */
export interface Machine {
  products: Product[];
  /** 반환용 잔돈 reserve (투입 현금과 독립 — TC-B10/A15 거스름돈 부족 재현) */
  coins: CoinFloat;
  /** 누적 매출 (배출 성공 시에만 증가, B-3.3) */
  revenue: number;
  /** 배출 실패 미반환금 (INV-4, A-7.3) — 매출 아님 */
  unreturnedFail: number;

  // ── 세션 상태 (A-2) ──
  /** 세션 내 현재 잔액 (A-2.2) */
  balance: number;
  /** 세션 구매 카운트 (프로모 A-7.1, A6-3: 결제 발생 횟수) */
  purchaseCount: number;
  state: SessionState;

  // ── 금액 원장 (INV-4) ──
  /** 누적 투입 총액 */
  totalInserted: number;
  /** 누적 반환 총액 */
  totalReturned: number;

  /**
   * 진행 중 배출 (DISPENSING 상태에서만 non-null). 재시작 시 배출을 재개할 수 있도록
   * 결제액을 보존한다 (INV-1). resolveDispense에서 소비 후 null.
   */
  pendingDispense: { productId: string; effectivePrice: number } | null;
}

/** 상품 구매 가능 여부 (A-3.1) */
export type Purchasability = 'AVAILABLE' | 'INSUFFICIENT' | 'SOLD_OUT';

/** 상품별 가격 표시 정보 (A-7.2, design-system §5.1) */
export interface PriceInfo {
  basePrice: number;
  /** 동적 인상액 (재고 ≤3, +500 or 0) */
  dynamicRaise: number;
  /** 프로모 할인액 (3·6·9번째, 500 or 0) */
  promoDiscount: number;
  /** 최종가 = max(0, 기본가 + 동적인상 − 프로모할인) */
  effectivePrice: number;
  /** 색상: 동적 인상 시 붉은색, 평상시 노란색 (design-system §5.1) */
  color: 'raised' | 'normal';
  /** 프로모 할인 적용 여부 (원가 취소선 표시용) */
  promoApplied: boolean;
}
