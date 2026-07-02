// 프론트 진입점 (하이브리드 §8.3.1) — 스타일/뷰 모듈을 co-locate 하여 import.
// 단일 탭 내 모드 토글 + SSE 부트스트랩. 판매/관리자는 다른 탭 동시 오픈도 가능(INV-7).
import './styles.css';
import * as api from './client.js';
import { renderSales } from './salesView.js';
import { renderAdmin } from './adminView.js';
import { h } from './ui.js';

type Route = 'sales' | 'admin';

const app = document.getElementById('app')!;

function currentRoute(): Route {
  return location.hash.replace('#/', '') === 'admin' ? 'admin' : 'sales';
}

let cleanup: (() => void) | null = null;
let activeRoute: Route | null = null;

function mount() {
  cleanup?.();
  app.replaceChildren();

  const route = currentRoute();

  // 모드 전환 감사 로그 (B-3.4). 최초 진입은 제외, 실제 전환만 기록.
  if (activeRoute && activeRoute !== route) {
    const label = (r: Route) => (r === 'admin' ? '관리자 모드' : '판매 모드');
    void api.logModeSwitch(label(activeRoute), label(route));
  }
  activeRoute = route;

  // 상단 모드 토글 바 (screen-layouts §3·4)
  const salesBtn = h('button', { class: route === 'sales' ? 'active' : '', text: '판매' });
  const adminBtn = h('button', { class: route === 'admin' ? 'active' : '', text: '관리자' });
  salesBtn.addEventListener('click', () => (location.hash = '#/sales'));
  adminBtn.addEventListener('click', () => (location.hash = '#/admin'));
  const topbar = h('div', { class: 'topbar' }, [
    h('h1', { text: route === 'admin' ? '관리자 모드' : '자판기' }),
    h('div', { class: 'modes' }, [salesBtn, adminBtn]),
  ]);

  const content = h('div', { style: 'flex:1;min-height:0;display:flex;flex-direction:column;' });
  app.append(topbar, content);

  cleanup = route === 'admin' ? renderAdmin(content) : renderSales(content);
}

window.addEventListener('hashchange', mount);

// 초기 상태 로드(INV-1 새로고침 복원) 후 SSE 실시간 구독(INV-7)
api.fetchState().finally(() => {
  api.connectSSE();
});
mount();
