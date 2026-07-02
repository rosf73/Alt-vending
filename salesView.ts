// 판매 화면 — device 오버레이, 3×3 그리드, 드래그 투입, 배출 큐브 낙하 (screen-layouts §2·6).
// 모든 판정/가격은 서버 뷰(MachineView)를 표시만 한다 (R9).
import * as api from './client.js';
import type { MachineView, ProductView } from './client.js';
import { clear, errorMessage, h, toast, won } from './ui.js';

const DENOMS = [
  { denom: 100, src: '/resources/100.png', type: 'coin' },
  { denom: 500, src: '/resources/500.png', type: 'coin' },
  { denom: 1000, src: '/resources/1000.jpeg', type: 'bill' }, // ⚠️ jpeg (design-system §8)
];
const AUTO_RETURN_SEC = 10; // §3.3

export function renderSales(root: HTMLElement): () => void {
  clear(root);
  const screen = h('div', { class: 'sales' });

  // device + 오버레이
  const grid = h('div', { class: 'overlay grid' });
  const balance = h('div', { class: 'overlay balance', 'aria-live': 'polite', text: '₩0' });
  const drop = h('div', { class: 'overlay drop', text: '💰 여기에 돈을 넣으세요' });
  const refundBtn = h('button', { class: 'overlay refund', text: '잔액 반환' }) as HTMLButtonElement;
  const dispense = h('div', { class: 'overlay dispense', text: '' });
  const statusline = h('div', { class: 'statusline', 'aria-live': 'assertive' });
  const device = h('div', { class: 'device' }, [grid, balance, drop, refundBtn, dispense, statusline]);
  const deviceWrap = h('div', { class: 'device-wrap' }, [device]);

  // ④ 화폐 트레이 (무한 소스 드래그 칩)
  const tray = h('div', { class: 'tray' });
  for (const { denom, src, type } of DENOMS) {
    const img = h('img', { src, alt: `${denom}원`, draggable: 'false' });
    let chip;
    if (type == 'coin') {
      chip = h('div', {
        class: 'chip',
        id: 'coin',
        draggable: 'true',
        role: 'button',
        tabindex: '0',
        title: `${denom.toLocaleString()}원 투입`,
        'aria-label': `${denom}원 투입`,
      }, [img]);
    } else {
      chip = h('div', {
        class: 'chip',
        id: 'bill',
        draggable: 'true',
        role: 'button',
        tabindex: '0',
        title: `${denom.toLocaleString()}원 투입`,
        'aria-label': `${denom}원 투입`,
      }, [img]);
    }
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/denom', String(denom));
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    // 접근성 대체: 클릭/Enter 투입 (design-system §5.2·5.7)
    chip.addEventListener('click', () => doInsert(denom));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doInsert(denom);
      }
    });
    tray.append(chip);
  }

  // 투입 공간 드롭 타깃
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const denom = Number(e.dataTransfer?.getData('text/denom'));
    if (denom) doInsert(denom);
  });

  refundBtn.addEventListener('click', async () => {
    const r = await api.refund();
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'danger');
  });

  screen.append(deviceWrap, tray);
  root.append(screen);

  async function doInsert(denom: number) {
    const r = await api.insertMoney(denom);
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'danger');
  }

  async function doPurchase(p: ProductView) {
    if (p.purchasability !== 'AVAILABLE') return; // 오조작 방지 (품절/부족)
    const r = await api.purchase(p.id);
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'warning');
  }

  // ── 상태 반영 ──
  let prev: MachineView | null = null;
  let displayedBalance = 0;
  let countdownTimer: number | null = null;
  let countdown = AUTO_RETURN_SEC;

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }
  function startCountdown() {
    stopCountdown();
    countdown = AUTO_RETURN_SEC;
    countdownTimer = window.setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) stopCountdown();
      renderStatus();
    }, 1000);
  }

  function renderStatus() {
    const v = api.getState();
    if (!v) return;
    statusline.className = 'statusline';
    if (v.state === 'DISPENSING') {
      statusline.textContent = '배출 중...';
    } else if (v.state === 'RETURNING') {
      statusline.textContent = '반환 중...';
    } else if (v.state === 'ACTIVE' && countdownTimer) {
      statusline.innerHTML = `잔여 <span class="countdown">${countdown}s</span> 후 자동 반환`;
    } else {
      statusline.textContent = v.state === 'IDLE' ? '대기 중 — 현금을 투입하세요' : '';
    }
  }

  function animateBalance(to: number) {
    const from = displayedBalance;
    const start = performance.now();
    const dur = 300;
    function step(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const val = Math.round(from + (to - from) * t);
      balance.textContent = won(val);
      if (t < 1) requestAnimationFrame(step);
      else displayedBalance = to;
    }
    requestAnimationFrame(step);
  }

  function dropCube(color: string) {
    dispense.classList.add('glow');
    const cube = h('div', { class: 'falling' });
    cube.style.background = color;

    // 배출 공간(③) top-center에서 튀어나오도록 시작 위치 계산 (§6.3)
    const zone = dispense.getBoundingClientRect();
    const startLeft = zone.left + zone.width / 2 - 32; // 큐브 폭 64
    const startTop = zone.top - 8; // 개구부 상단에서 살짝 위로 튀어나옴
    const floorTop = window.innerHeight - 88; // 뷰포트 bottom 밀착
    cube.style.left = `${startLeft}px`;
    cube.style.top = `${startTop}px`;
    document.body.append(cube);

    // 튀어나옴(위로 pop) → 회전하며 낙하 → 바운스 1회 → 정지 (§6.3)
    cube.animate(
      [
        { top: `${startTop}px`, transform: 'rotate(0deg)', offset: 0 },
        { top: `${startTop - 28}px`, transform: 'rotate(40deg)', offset: 0.14 },
        { top: `${floorTop}px`, transform: 'rotate(340deg)', offset: 0.82 },
        { top: `${floorTop - 20}px`, transform: 'rotate(352deg)', offset: 0.9 },
        { top: `${floorTop}px`, transform: 'rotate(360deg)', offset: 1 },
      ],
      { duration: 1100, easing: 'ease-in', fill: 'forwards' },
    );
    setTimeout(() => {
      cube.remove();
      dispense.classList.remove('glow');
    }, 2600);
  }

  function apply(v: MachineView) {
    // 배출 시작
    if (prev && prev.state !== 'DISPENSING' && v.state === 'DISPENSING') {
      stopCountdown();
    }
    // 배출 판정 결과 (DISPENSING → 종료): revenue/미반환금 델타로 성공/실패 판별
    if (prev && prev.state === 'DISPENSING' && v.state !== 'DISPENSING') {
      const pid = prev.pendingDispense?.productId;
      const product = v.products.find((p) => p.id === pid);
      if (v.revenue > prev.revenue) {
        dropCube(product?.color ?? '#888');
        toast(`${product?.name ?? '상품'} 배출 완료!`, 'success');
      } else if (v.unreturnedFail > prev.unreturnedFail) {
        dispense.classList.add('shake');
        setTimeout(() => dispense.classList.remove('shake'), 400);
        statusline.className = 'statusline danger';
        toast('배출 실패 — 사용 금액이 반환되지 않았습니다', 'danger');
      }
    }
    // 반환/자동반환 발생 (totalReturned 증가)
    if (prev && v.totalReturned > prev.totalReturned) {
      toast(`${won(v.totalReturned - prev.totalReturned)} 반환되었습니다`, 'success');
    }

    // 잔액 카운트업
    if (!prev || prev.balance !== v.balance) animateBalance(v.balance);
    else balance.textContent = won(v.balance);

    // 자동반환 카운트다운: ACTIVE 진입/잔액 변동 시 리셋 (BR-A7)
    if (v.state === 'ACTIVE') {
      if (!prev || prev.state !== 'ACTIVE' || prev.balance !== v.balance) startCountdown();
    } else {
      stopCountdown();
    }

    refundBtn.disabled = v.balance <= 0 || v.state === 'DISPENSING';
    renderGrid(v);
    renderStatus();
    prev = v;
  }

  function renderGrid(v: MachineView) {
    clear(grid);
    const cells = 9;
    for (let i = 0; i < cells; i++) {
      const p = v.products[i];
      if (!p) {
        grid.append(h('div', { class: 'cell empty' }));
        continue;
      }
      grid.append(buildCell(p));
    }
  }

  function buildCell(p: ProductView): HTMLElement {
    const cube = h('div', { class: 'cube' });
    cube.style.background = p.color;
    const name = h('div', { class: 'name', text: p.name });
    const qty = h('div', { class: 'qty', text: p.qty > 0 ? `재고 ${p.qty}` : '품절' });

    const price = h('div', { class: 'price' });
    if (p.purchasability === 'SOLD_OUT') {
      price.className = 'price sold';
      price.textContent = won(p.effectivePrice);
    } else {
      price.classList.add(p.priceColor); // raised(빨강) | normal(노랑)
      if (p.promoApplied && p.promoDiscount > 0) {
        // 프로모: 원가 취소선 + 할인가
        price.append(
          h('span', { class: 'orig', text: won(p.basePrice + p.dynamicRaise) }),
          document.createTextNode(won(p.effectivePrice)),
          h('span', { class: 'badge promo', text: '-500' }),
        );
      } else {
        price.textContent = won(p.effectivePrice);
      }
    }

    const cls = `cell ${p.purchasability.toLowerCase()}`;
    const cell = h('div', {
      class: cls,
      role: 'button',
      'aria-label': `${p.name} ${won(p.effectivePrice)} ${labelFor(p.purchasability)}`,
    }, [cube, name, qty, price]);
    if (p.purchasability === 'AVAILABLE') cell.addEventListener('click', () => doPurchase(p));
    return cell;
  }

  const unsub = api.onState(apply);
  return () => {
    stopCountdown();
    unsub();
  };
}

function labelFor(s: string): string {
  return s === 'AVAILABLE' ? '구매 가능' : s === 'SOLD_OUT' ? '품절' : '금액 부족';
}
