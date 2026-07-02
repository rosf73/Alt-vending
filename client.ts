// 프론트 클라이언트 — 백엔드 상태 조회/명령(REST) + 실시간 구독(SSE).
// 비즈니스 규칙은 복제하지 않는다 (R9): 최종가/구매가능/색상은 서버 뷰(MachineView)를 그대로 표시.
import type { MachineView } from './domain/projection.js';
import type { AuditEntry } from './domain/audit.js';

export type { MachineView, AuditEntry };
export type ProductView = MachineView['products'][number];

let current: MachineView | null = null;
const listeners = new Set<(v: MachineView) => void>();

/** 최신 상태 (없으면 null) */
export function getState(): MachineView | null {
  return current;
}

/** 상태 변경 구독. 즉시 현재 값으로 1회 호출. 해제 함수 반환. */
export function onState(fn: (v: MachineView) => void): () => void {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

function emit(v: MachineView) {
  current = v;
  for (const fn of listeners) fn(v);
}

/** SSE 연결 — 상태 변경을 실시간 수신 (INV-7). 끊기면 자동 재연결. */
export function connectSSE(): void {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    try {
      emit(JSON.parse(e.data) as MachineView);
    } catch {
      /* ping 등 무시 */
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 1500); // 재연결
  };
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // 응답에 최신 상태가 실려오면 즉시 반영 (SSE보다 먼저 도착할 수 있음)
  if (data?.state) emit(data.state as MachineView);
  return { ok: res.ok, ...data } as { ok: boolean; error?: string; [k: string]: unknown };
}

// ── 판매 명령 ──
export const insertMoney = (denom: number) => post('/api/insert', { denom });
export const purchase = (productId: string) => post('/api/purchase', { productId });
export const refund = () => post('/api/refund');

// ── 관리자 명령 ──
export const setQty = (id: string, qty: number) => post(`/api/admin/products/${id}/qty`, { qty });
export const setPrice = (id: string, price: number) => post(`/api/admin/products/${id}/price`, { price });
export const addProduct = (p: { name: string; basePrice: number; qty: number; color: string }) =>
  post('/api/admin/products', p);
export async function removeProduct(id: string) {
  const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (data?.state) emit(data.state as MachineView);
  return { ok: res.ok, ...data };
}
export const setCoin = (denom: number, count: number) => post(`/api/admin/coins/${denom}`, { count });
export const resetMachine = () => post('/api/admin/reset');

/** 초기 상태 fetch (SSE 연결 전/새로고침 시, INV-1) */
export async function fetchState(): Promise<MachineView> {
  const res = await fetch('/api/state');
  const v = (await res.json()) as MachineView;
  emit(v);
  return v;
}

// ── 감사 로그 (REQ-B11) ──
export async function fetchAudit(limit = 200): Promise<AuditEntry[]> {
  const res = await fetch(`/api/audit?limit=${limit}`);
  const data = (await res.json()) as { ok: boolean; entries: AuditEntry[] };
  return data.entries ?? [];
}
export const logModeSwitch = (from: string, to: string) => post('/api/audit/mode-switch', { from, to });
