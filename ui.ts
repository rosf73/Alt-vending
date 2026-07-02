// UI 공통 헬퍼 — DOM 생성, 토스트(design-system §5.6), 포맷.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> & { class?: string; text?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

export function clear(node: HTMLElement) {
  node.replaceChildren();
}

/** ₩ 접두 + 천단위 콤마 (design-system §5.9) */
export function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

let toastHost: HTMLElement | null = null;
export function toast(message: string, kind: 'success' | 'warning' | 'danger' = 'success') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const t = h('div', { class: `toast ${kind}`, text: message });
  toastHost.append(t);
  setTimeout(() => t.remove(), 2600);
}

/** 배출/반환 에러 코드 → 사용자 메시지 */
export function errorMessage(code: string): string {
  const map: Record<string, string> = {
    INVALID_DENOMINATION: '사용할 수 없는 화폐입니다 (100/500/1,000원만 가능)',
    INSUFFICIENT_BALANCE: '금액이 부족합니다',
    SOLD_OUT: '품절된 상품입니다',
    INSUFFICIENT_CHANGE: '거스름돈이 부족합니다 — 잠시 후 다시 시도하세요',
    BUSY: '처리 중입니다. 잠시만 기다려 주세요',
    PRICE_OUT_OF_RANGE: '기본가는 100~10,000원만 가능합니다',
    NEGATIVE_QTY: '수량은 0 미만이 될 수 없습니다',
    NEGATIVE_COIN: '잔돈 개수는 0 미만이 될 수 없습니다',
    MAX_PRODUCTS: '상품은 최대 9개까지 가능합니다',
    DUPLICATE_ID: '이미 존재하는 상품입니다',
    NOT_FOUND: '대상을 찾을 수 없습니다',
  };
  return map[code] ?? `오류: ${code}`;
}
