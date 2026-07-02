// 판매 서비스 — 도메인 연산 + 영속 + 실시간 브로드캐스트 + 타이머 오케스트레이션.
// 단일 공유 상태를 메모리에 두고 매 변경마다 persist(INV-1) & notify(INV-7).
// Node 단일 스레드 → 핸들러 실행이 직렬화되어 원자성 보장 (INV-2, 아키텍처 §5.4·5.5).
import type { Denomination, Machine, Product } from '../domain/types.js';
import { beginDispense, insert, refund, resolveDispense, type OpError } from '../domain/session.js';
import { addProduct, removeProduct, setBasePrice, setCoinCount, setQty, type AdminError } from '../domain/admin.js';
import { projectMachine, type MachineView } from '../domain/projection.js';
import type { VendingStore } from '../persistence/store.js';

export interface ServiceOptions {
  /** 배출 성공 판정 RNG (A6-6, 주입 가능). 기본: 90% 성공. */
  rng?: () => boolean;
  /** 배출 지연(ms) 생성기 (§3.3, 기본 1~2초). 테스트는 0 주입. */
  dispenseDelayMs?: () => number;
  /** 미구매 자동 반환(ms) (§3.3, 기본 10초). */
  autoReturnMs?: number;
}

type Listener = (view: MachineView) => void;

export class VendingService {
  private machine: Machine;
  private listeners = new Set<Listener>();
  private rng: () => boolean;
  private dispenseDelayMs: () => number;
  private autoReturnMs: number;
  private autoReturnTimer: NodeJS.Timeout | null = null;
  private dispenseTimer: NodeJS.Timeout | null = null;

  constructor(private store: VendingStore, opts: ServiceOptions = {}) {
    this.machine = store.load();
    this.rng = opts.rng ?? (() => Math.random() < 0.9);
    this.dispenseDelayMs = opts.dispenseDelayMs ?? (() => 1000 + Math.floor(Math.random() * 1000));
    this.autoReturnMs = opts.autoReturnMs ?? 10_000;
    // 재시작 시 DISPENSING 미완 배출을 재개 (INV-1)
    if (this.machine.state === 'DISPENSING' && this.machine.pendingDispense) {
      this.scheduleDispense();
    }
    if (this.machine.state === 'ACTIVE') this.scheduleAutoReturn();
  }

  view(): MachineView {
    return projectMachine(this.machine);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── 판매 연산 ──

  insert(denom: number): { ok: true } | { ok: false; error: OpError } {
    const r = insert(this.machine, denom);
    if (r.ok) {
      this.scheduleAutoReturn(); // BR-A7: 추가 투입 시 타이머 리셋
      this.commit();
    }
    return r.ok ? { ok: true } : r;
  }

  /** 구매 확정 → 배출 시작. 1~2초 후 RNG 판정을 비동기 스케줄. */
  purchase(productId: string): { ok: true; effectivePrice: number } | { ok: false; error: OpError } {
    const r = beginDispense(this.machine, productId);
    if (!r.ok) return r;
    this.clearAutoReturn(); // 배출 중에는 자동 반환 정지
    this.commit(); // DISPENSING 상태 브로드캐스트
    this.scheduleDispense();
    return r;
  }

  refund(): ReturnType<typeof refund> {
    const r = refund(this.machine);
    if (r.ok) {
      this.clearAutoReturn();
      this.commit();
    }
    return r;
  }

  private scheduleDispense(): void {
    if (this.dispenseTimer) clearTimeout(this.dispenseTimer);
    this.dispenseTimer = setTimeout(() => {
      this.dispenseTimer = null;
      const success = this.rng();
      resolveDispense(this.machine, success);
      if (this.machine.state === 'ACTIVE') this.scheduleAutoReturn(); // 잔액 남으면 타이머 재개
      this.commit();
    }, this.dispenseDelayMs());
  }

  private scheduleAutoReturn(): void {
    this.clearAutoReturn();
    if (this.autoReturnMs <= 0) return; // 테스트에서 비활성
    this.autoReturnTimer = setTimeout(() => {
      this.autoReturnTimer = null;
      if (this.machine.state === 'ACTIVE') {
        refund(this.machine); // REQ-A8 자동 반환
        this.commit();
      }
    }, this.autoReturnMs);
  }

  private clearAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer);
      this.autoReturnTimer = null;
    }
  }

  // ── 관리자 연산 (변경 시 실시간 반영 BR-B7/B11) ──

  setQty(id: string, qty: number): AdminResultLike {
    return this.adminCommit(setQty(this.machine, id, qty));
  }
  setPrice(id: string, price: number): AdminResultLike {
    return this.adminCommit(setBasePrice(this.machine, id, price));
  }
  addProduct(p: Product): AdminResultLike {
    return this.adminCommit(addProduct(this.machine, p));
  }
  removeProduct(id: string): AdminResultLike {
    return this.adminCommit(removeProduct(this.machine, id));
  }
  setCoin(denom: Denomination, count: number): AdminResultLike {
    return this.adminCommit(setCoinCount(this.machine, denom, count));
  }

  reset(): void {
    this.clearAutoReturn();
    if (this.dispenseTimer) clearTimeout(this.dispenseTimer);
    this.machine = this.store.reset();
    this.commit();
  }

  private adminCommit(r: { ok: true } | { ok: false; error: AdminError }): AdminResultLike {
    if (r.ok) {
      // 관리자 재고/가격 변경이 진행 중 세션의 구매가능/최종가에 즉시 반영됨 (INV-7)
      this.commit();
    }
    return r;
  }

  /** 영속 저장 + 모든 구독자에 실시간 push (INV-1 + INV-7). */
  private commit(): void {
    this.store.persist(this.machine);
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }
}

type AdminResultLike = { ok: true } | { ok: false; error: AdminError };
