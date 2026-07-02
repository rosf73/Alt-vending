// 감사 로그 — 관리자 조작·판매 이벤트 기록 (admin-mode B-2.4·B-3.4, REQ-B11).
// 각 항목: 시각·이벤트 유형·상세(변경 전/후)·결과. 백엔드에 append-only로 영속.
// 순수 타입/라벨만 정의 (적재/시각 생성은 server 계층 책임).

/** 기록 대상 이벤트 유형 (B-3.4 설계 지침) */
export type AuditEventType =
  | 'SALE_SUCCESS' // 판매 성공 (배출 완료)
  | 'SALE_FAIL' // 판매 실패 (배출 실패, 미반환)
  | 'AUTO_REFUND' // 자동 반환 (10초 미구매)
  | 'MANUAL_REFUND' // 수동 반환 (반환 버튼)
  | 'STOCK_CHANGE' // 재고 변경
  | 'PRICE_CHANGE' // 가격 변경
  | 'COIN_CHANGE' // 잔돈 보충/회수
  | 'PRODUCT_ADD' // 상품 추가
  | 'PRODUCT_REMOVE' // 상품 제거
  | 'REVENUE_RESET' // 매출 초기화(정산)/전체 리셋
  | 'MODE_SWITCH'; // 모드 전환

/** 감사 로그 항목 (B-3.4: 시각·유형·상세·결과 + 변경 전/후) */
export interface AuditEntry {
  id: number;
  /** 시각 (ISO 8601) */
  at: string;
  /** 이벤트 유형 */
  type: AuditEventType;
  /** 상세 (사람이 읽는 변경 요약) */
  detail: string;
  /** 결과 */
  result: 'OK' | 'FAIL';
  /** 변경 전 값 (JSON 문자열, 없으면 null) */
  before: string | null;
  /** 변경 후 값 (JSON 문자열, 없으면 null) */
  after: string | null;
}

/** 신규 적재용 (id/at는 저장 시 부여) */
export type NewAuditEntry = Omit<AuditEntry, 'id' | 'at'>;

/** 이벤트 유형 한국어 라벨 (로그 UI) */
export const AUDIT_LABELS: Record<AuditEventType, string> = {
  SALE_SUCCESS: '판매 성공',
  SALE_FAIL: '판매 실패',
  AUTO_REFUND: '자동 반환',
  MANUAL_REFUND: '수동 반환',
  STOCK_CHANGE: '재고 변경',
  PRICE_CHANGE: '가격 변경',
  COIN_CHANGE: '잔돈 조정',
  PRODUCT_ADD: '상품 추가',
  PRODUCT_REMOVE: '상품 제거',
  REVENUE_RESET: '매출 초기화',
  MODE_SWITCH: '모드 전환',
};
