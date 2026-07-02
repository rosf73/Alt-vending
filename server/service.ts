// 판매 서비스 — 도메인 연산 + 영속 + 실시간 브로드캐스트 + 타이머 오케스트레이션.
// 단일 공유 상태를 메모리에 두고 매 변경마다 persist(INV-1) & notify(INV-7).
// Node 단일 스레드 → 핸들러 실행이 직렬화되어 원자성 보장 (INV-2, 아키텍처 §5.4·5.5).
import type { Denomination, Machine, Product } from '../domain/types.js';
import { beginDispense, insert, refund, resolveDispense, type OpError } from '../domain/session.js';
import { addProduct, removeProduct, setBasePrice, setCoinCount, setQty, type AdminError } from '../domain/admin.js';
import { projectMachine, type MachineView } from '../domain/projection.js';
import { findProduct } from '../domain/machine.js';
import type { AuditEntry, NewAuditEntry } from '../domain/audit.js';
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
    const amount = this.machine.balance;
    const r = refund(this.machine);
    this.audit({
      type: 'MANUAL_REFUND',
      result: r.ok ? 'OK' : 'FAIL',
      detail: r.ok ? `잔여 잔액 ${amount.toLocaleString()}원 반환` : `반환 실패 (거스름돈 부족, 잔액 ${amount.toLocaleString()}원 유지)`,
      before: JSON.stringify({ balance: amount }),
      after: JSON.stringify({ balance: this.machine.balance, breakdown: r.ok ? r.breakdown : null }),
    });
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
      const pending = this.machine.pendingDispense;
      const product = pending ? findProduct(this.machine, pending.productId) : undefined;
      const name = product?.name ?? pending?.productId ?? '?';
      const price = pending?.effectivePrice ?? 0;
      const success = this.rng();
      resolveDispense(this.machine, success);
      this.audit({
        type: success ? 'SALE_SUCCESS' : 'SALE_FAIL',
        result: success ? 'OK' : 'FAIL',
        detail: success
          ? `${name} 배출 성공 (${price.toLocaleString()}원, 매출 반영)`
          : `${name} 배출 실패 (${price.toLocaleString()}원 미반환, 재고 -1)`,
        before: null,
        after: JSON.stringify({ productId: pending?.productId, price, success }),
      });
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
        const amount = this.machine.balance;
        const r = refund(this.machine); // REQ-A8 자동 반환
        this.audit({
          type: 'AUTO_REFUND',
          result: r.ok ? 'OK' : 'FAIL',
          detail: r.ok ? `미구매 10초 경과 — ${amount.toLocaleString()}원 자동 반환` : `자동 반환 실패 (거스름돈 부족)`,
          before: JSON.stringify({ balance: amount }),
          after: JSON.stringify({ balance: this.machine.balance }),
        });
        if (r.ok) this.commit();
      }
    }, this.autoReturnMs);
  }

  private clearAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer);
      this.autoReturnTimer = null;
    }
  }

  // ── 관리자 연산 (변경 시 실시간 반영 BR-B7/B11, 감사 로그 적재 BR-B9) ──

  setQty(id: string, qty: number): AdminResultLike {
    const p = findProduct(this.machine, id);
    const before = p?.qty;
    const r = setQty(this.machine, id, qty);
    this.audit({
      type: 'STOCK_CHANGE',
      result: r.ok ? 'OK' : 'FAIL',
      detail: `${p?.name ?? id} 재고 ${before ?? '-'} → ${qty}`,
      before: JSON.stringify({ qty: before }),
      after: JSON.stringify({ qty }),
    });
    return this.adminCommit(r);
  }
  setPrice(id: string, price: number): AdminResultLike {
    const p = findProduct(this.machine, id);
    const before = p?.basePrice;
    const r = setBasePrice(this.machine, id, price);
    this.audit({
      type: 'PRICE_CHANGE',
      result: r.ok ? 'OK' : 'FAIL',
      detail: `${p?.name ?? id} 기본가 ${before ?? '-'} → ${price}`,
      before: JSON.stringify({ basePrice: before }),
      after: JSON.stringify({ basePrice: price }),
    });
    return this.adminCommit(r);
  }
  addProduct(p: Product): AdminResultLike {
    const r = addProduct(this.machine, p);
    this.audit({
      type: 'PRODUCT_ADD',
      result: r.ok ? 'OK' : 'FAIL',
      detail: `${p.name} 추가 (기본가 ${p.basePrice}, 수량 ${p.qty})`,
      before: null,
      after: JSON.stringify({ id: p.id, name: p.name, basePrice: p.basePrice, qty: p.qty }),
    });
    return this.adminCommit(r);
  }
  removeProduct(id: string): AdminResultLike {
    const p = findProduct(this.machine, id);
    const r = removeProduct(this.machine, id);
    this.audit({
      type: 'PRODUCT_REMOVE',
      result: r.ok ? 'OK' : 'FAIL',
      detail: `${p?.name ?? id} 제거`,
      before: JSON.stringify(p ? { id: p.id, name: p.name, basePrice: p.basePrice, qty: p.qty } : null),
      after: null,
    });
    return this.adminCommit(r);
  }
  setCoin(denom: Denomination, count: number): AdminResultLike {
    const before = this.machine.coins[denom];
    const r = setCoinCount(this.machine, denom, count);
    this.audit({
      type: 'COIN_CHANGE',
      result: r.ok ? 'OK' : 'FAIL',
      detail: `${denom.toLocaleString()}원 잔돈 ${before} → ${count}개`,
      before: JSON.stringify({ count: before }),
      after: JSON.stringify({ count }),
    });
    return this.adminCommit(r);
  }

  /** 모드 전환 기록 (B-3.4). 상태 변경 없음 — 감사 로그만 적재. */
  logModeSwitch(from: string, to: string): void {
    this.audit({
      type: 'MODE_SWITCH',
      result: 'OK',
      detail: `${from} → ${to}`,
      before: JSON.stringify({ mode: from }),
      after: JSON.stringify({ mode: to }),
    });
  }

  reset(): void {
    this.clearAutoReturn();
    if (this.dispenseTimer) clearTimeout(this.dispenseTimer);
    this.machine = this.store.reset(); // 상태 + 감사 로그 초기화
    this.audit({ type: 'REVENUE_RESET', result: 'OK', detail: '전체 초기화 (매출·재고·잔돈·세션·로그 리셋)', before: null, after: null });
    this.commit();
  }

  /** 감사 로그 조회 (REQ-B11). */
  listAudit(limit?: number): AuditEntry[] {
    return this.store.listAudit(limit);
  }

  private adminCommit(r: { ok: true } | { ok: false; error: AdminError }): AdminResultLike {
    if (r.ok) {
      // 관리자 재고/가격 변경이 진행 중 세션의 구매가능/최종가에 즉시 반영됨 (INV-7)
      this.commit();
    }
    return r;
  }

  /** 감사 로그 1건 적재 (백엔드 영속, B-3.4). */
  private audit(entry: NewAuditEntry): void {
    this.store.appendAudit(entry);
  }

  /** 영속 저장 + 모든 구독자에 실시간 push (INV-1 + INV-7). */
  private commit(): void {
    this.store.persist(this.machine);
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }
}

type AdminResultLike = { ok: true } | { ok: false; error: AdminError };
