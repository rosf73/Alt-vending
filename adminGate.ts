// 관리자 진입 게이트 (admin-mode B-4: 간단한 진입 게이트). 비밀번호 임시 "1234".
// 프론트 게이트(화면 진입 제어). 인증 상태는 탭 세션(sessionStorage)에 유지.
import { h } from './ui.js';

const PASSWORD = '1234'; // ⚠️ 임시 관리자 비밀번호 (요구사항: 임시로 1234)
const AUTH_KEY = 'vending_admin_authed';

export function isAdminAuthed(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === '1';
}

/** 관리자 인증 화면. 성공 시 세션 인증 플래그 설정 후 onSuccess 호출. */
export function renderAdminGate(root: HTMLElement, onSuccess: () => void): () => void {
  root.replaceChildren();

  const input = h('input', {
    type: 'password',
    class: 'gate-input',
    placeholder: '비밀번호',
    inputmode: 'numeric',
    'aria-label': '관리자 비밀번호',
    autocomplete: 'off',
  }) as HTMLInputElement;
  const err = h('div', { class: 'gate-err', 'aria-live': 'assertive' });
  const btn = h('button', { class: 'btn gate-btn', text: '확인' });

  const submit = () => {
    if (input.value === PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1');
      onSuccess();
    } else {
      err.textContent = '비밀번호가 올바르지 않습니다';
      input.value = '';
      input.focus();
    }
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  const card = h('div', { class: 'gate-card' }, [
    h('div', { class: 'gate-title', text: '🔒 관리자 인증' }),
    h('div', { class: 'gate-sub', text: '관리자 모드에 진입하려면 비밀번호를 입력하세요' }),
    input,
    err,
    btn,
  ]);
  root.append(h('div', { class: 'gate' }, [card]));
  setTimeout(() => input.focus(), 50);

  return () => {};
}
