// 프론트 진입점 (하이브리드 §8.3.1) — 스타일/뷰 모듈을 co-locate 하여 import.
// 단일 탭 내 모드 토글 + SSE 부트스트랩. 판매/관리자는 다른 탭 동시 오픈도 가능(INV-7).
import './styles.css';
import * as api from './client.js';
import { renderSales3D } from './sales3d.js';
import { renderAdmin3D } from './admin3d.js';
import { isAdminAuthed, renderAdminGate } from './adminGate.js';
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
  // 관리자 진입 시 인증 필요 (B-4 게이트). 미인증이면 게이트 화면을 띄운다.
  const needsGate = route === 'admin' && !isAdminAuthed();

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

  if (needsGate) {
    // 인증 전에는 모드 전환 로그를 남기지 않는다(실제 진입이 아님).
    cleanup = renderAdminGate(content, () => mount());
    return;
  }

  // 모드 전환 감사 로그 (B-3.4). 실제 진입한 모드 기준으로만 기록.
  if (activeRoute && activeRoute !== route) {
    const label = (r: Route) => (r === 'admin' ? '관리자 모드' : '판매 모드');
    void api.logModeSwitch(label(activeRoute), label(route));
  }
  activeRoute = route;

  cleanup = route === 'admin' ? renderAdmin3D(content) : renderSales3D(content);
}

window.addEventListener('hashchange', mount);

// 초기 상태 로드(INV-1 새로고침 복원) 후 SSE 실시간 구독(INV-7)
api.fetchState().finally(() => {
  api.connectSSE();
});
mount();
