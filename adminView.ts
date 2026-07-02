// 관리자 화면 — 재고/잔돈/매출/로그 탭 (admin-screen §3, screen-layouts §3).
// 인라인 편집 + 저장 (design-system §5.5). 변경은 실시간으로 판매 탭에 반영(INV-7).
import * as api from './client.js';
import type { MachineView } from './client.js';
import { AUDIT_LABELS, type AuditEventType } from './domain/audit.js';
import { clear, errorMessage, h, toast, won } from './ui.js';

type Tab = 'stock' | 'coins' | 'sales' | 'log';
const CUBE_COLORS = ['#E74C3C', '#27AE60', '#2F80ED', '#8B5E3C', '#9B59B6', '#F39C12', '#1ABC9C', '#E91E63', '#607D8B'];

export function renderAdmin(root: HTMLElement): () => void {
  clear(root);
  let tab: Tab = 'stock';

  const tabs = h('div', { class: 'tabs' });
  const panel = h('div', { class: 'panel' });
  const wrap = h('div', { class: 'admin' }, [tabs, panel]);
  root.append(wrap);

  const tabDefs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: 'stock', label: '재고 관리' },
    { key: 'coins', label: '잔돈 관리' },
    { key: 'sales', label: '매출' },
    { key: 'log', label: '감사 로그' },
  ];

  function renderTabs() {
    clear(tabs);
    for (const t of tabDefs) {
      const b = h('button', { class: t.key === tab ? 'active' : '', text: t.label }) as HTMLButtonElement;
      if (t.disabled) b.disabled = true;
      else b.addEventListener('click', () => { tab = t.key; render(api.getState()); });
      tabs.append(b);
    }
  }

  function render(v: MachineView | null) {
    renderTabs();
    clear(panel);
    if (!v) return;
    if (tab === 'stock') renderStock(v);
    else if (tab === 'coins') renderCoins(v);
    else if (tab === 'sales') renderSales(v);
    else renderLog();
  }

  // ── 재고 관리 (REQ-B1~B3, B12) ──
  function renderStock(v: MachineView) {
    const table = h('table');
    table.append(
      h('thead', {}, [rowTh(['상품', '기본가', '수량', ''])]),
    );
    const tbody = h('tbody');
    for (const p of v.products) {
      const price = h('input', { type: 'number', value: String(p.basePrice), min: '100', max: '99999' }) as HTMLInputElement;
      const qty = h('input', { type: 'number', value: String(p.qty), min: '0' }) as HTMLInputElement;
      const save = h('button', { class: 'btn', text: '저장' });
      save.addEventListener('click', async () => {
        const pr = await api.setPrice(p.id, Number(price.value));
        if (!pr.ok) return toast(errorMessage(String(pr.error)), 'danger');
        const qr = await api.setQty(p.id, Number(qty.value));
        if (!qr.ok) return toast(errorMessage(String(qr.error)), 'danger');
        toast(`${p.name} 저장 완료`, 'success');
      });
      const del = h('button', { class: 'btn danger', text: '삭제' });
      del.addEventListener('click', async () => {
        const r = await api.removeProduct(p.id);
        if (!r.ok) toast(errorMessage(String((r as any).error)), 'danger');
        else toast(`${p.name} 삭제`, 'success');
      });
      const cube = h('span', {}, [p.name]);
      tbody.append(h('tr', {}, [h('td', {}, [cube]), h('td', {}, [price]), h('td', {}, [qty]), h('td', {}, [save, del])]));
    }
    table.append(tbody);
    panel.append(table);

    // + 상품 추가 (최대 9개, BR-B10)
    const atMax = v.products.length >= 9;
    const nameIn = h('input', { class: 'name', placeholder: '상품명' }) as HTMLInputElement;
    const priceIn = h('input', { type: 'number', placeholder: '기본가', min: '100', max: '99999', value: '1000' }) as HTMLInputElement;
    const qtyIn = h('input', { type: 'number', placeholder: '수량', min: '0', value: '5' }) as HTMLInputElement;
    const addBtn = h('button', { class: 'btn', text: '+ 상품 추가' }) as HTMLButtonElement;
    addBtn.disabled = atMax;
    addBtn.addEventListener('click', async () => {
      if (!nameIn.value.trim()) return toast('상품명을 입력하세요', 'warning');
      const color = CUBE_COLORS[v.products.length % CUBE_COLORS.length];
      const r = await api.addProduct({ name: nameIn.value.trim(), basePrice: Number(priceIn.value), qty: Number(qtyIn.value), color });
      if (!r.ok) toast(errorMessage(String(r.error)), 'danger');
      else { toast('상품 추가 완료', 'success'); nameIn.value = ''; }
    });
    panel.append(
      h('div', { class: 'addrow' }, [nameIn, priceIn, qtyIn, addBtn]),
      h('div', { class: 'metric' }, [
        h('span', { text: `상품 ${v.products.length} / 9` }),
        h('span', { class: atMax ? 'v muted' : 'v', text: atMax ? '가득 참' : '' }),
      ]),
    );
  }

  // ── 잔돈 관리 (REQ-B4·B5) ──
  function renderCoins(v: MachineView) {
    const table = h('table');
    table.append(h('thead', {}, [rowTh(['단위', '개수', '환산액', ''])]));
    const tbody = h('tbody');
    for (const denom of [1000, 500, 100] as const) {
      const count = h('input', { type: 'number', value: String(v.coins[denom]), min: '0' }) as HTMLInputElement;
      const save = h('button', { class: 'btn', text: '저장' });
      save.addEventListener('click', async () => {
        const r = await api.setCoin(denom, Number(count.value));
        if (!r.ok) toast(errorMessage(String(r.error)), 'danger');
        else toast(`${denom.toLocaleString()}원 잔돈 저장`, 'success');
      });
      const sub = h('td', { text: won(denom * v.coins[denom]) });
      tbody.append(h('tr', {}, [h('td', { text: `${denom.toLocaleString()}원` }), h('td', {}, [count]), sub, h('td', {}, [save])]));
    }
    table.append(tbody);
    panel.append(table, h('div', { class: 'metric' }, [h('span', { text: '보유 잔돈 총액' }), h('span', { class: 'v', text: won(v.coinsTotal) })]));
  }

  // ── 매출 확인 (REQ-B6) ──
  function renderSales(v: MachineView) {
    panel.append(
      h('div', { class: 'metric' }, [h('span', { text: '누적 매출액' }), h('span', { class: 'v', text: won(v.revenue) })]),
      h('div', { class: 'metric' }, [
        h('span', { text: '배출 실패 미반환금 (매출 아님)' }),
        h('span', { class: 'v muted', text: won(v.unreturnedFail) }),
      ]),
      h('div', { class: 'metric' }, [
        h('span', { text: '금액 원장 (INV-4)' }),
        h('span', { class: 'v', text: v.ledgerOk ? '✓ 보존' : '✗ 불일치' }),
      ]),
    );
  }

  // ── 감사 로그 (REQ-B11) — 백엔드 적재 이벤트 조회 ──
  function renderLog() {
    const table = h('table', { class: 'auditlog' });
    table.append(h('thead', {}, [rowTh(['시각', '유형', '상세', '결과'])]));
    const tbody = h('tbody');
    table.append(tbody);
    const empty = h('div', { class: 'planned', text: '기록된 이벤트가 없습니다' });
    panel.append(table, empty);

    api.fetchAudit(200).then((entries) => {
      if (tab !== 'log') return; // 그 사이 탭이 바뀌었으면 무시
      empty.style.display = entries.length ? 'none' : '';
      clear(tbody);
      for (const e of entries) {
        const time = new Date(e.at).toLocaleTimeString('ko-KR', { hour12: false });
        const label = AUDIT_LABELS[e.type as AuditEventType] ?? e.type;
        const resultCell = h('td', { class: e.result === 'OK' ? 'ok' : 'fail', text: e.result === 'OK' ? '성공' : '실패' });
        tbody.append(
          h('tr', {}, [
            h('td', { class: 'at', text: time }),
            h('td', {}, [h('span', { class: `logtype ${e.type}`, text: label })]),
            h('td', { class: 'detail', text: e.detail }),
            resultCell,
          ]),
        );
      }
    });
  }

  const unsub = api.onState((v) => render(v));
  return () => unsub();
}

function rowTh(labels: string[]): HTMLElement {
  return h('tr', {}, labels.map((l) => h('th', { text: l })));
}
