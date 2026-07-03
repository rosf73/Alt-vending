// 관리자 화면 (3D 스타일) — Three.js 3D 배경 씬 + 글래스 패널에 기존 관리자 기능 재사용.
// renderAdmin(재고/잔돈/매출/로그)을 그대로 호출하므로 관리 기능·감사로그는 동일하게 동작.
import * as THREE from 'three';
import { renderAdmin } from './adminView.js';
import { h } from './ui.js';

const PALETTE = [0xe74c3c, 0x27ae60, 0x2f80ed, 0x8b5e3c, 0x9b59b6, 0xf39c12, 0x1abc9c, 0xe91e63];

export function renderAdmin3D(root: HTMLElement): () => void {
  root.replaceChildren();
  const wrap = h('div', { class: 'admin3d' });
  const bg = h('div', { class: 'admin-bg' });
  const fg = h('div', { class: 'admin-fg' });
  wrap.append(bg, fg);
  root.append(wrap);

  // ── 3D 배경 씬 ──
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0d10, 0.06);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.5, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bg.append(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 5, 4);
  scene.add(key);
  const blue = new THREE.PointLight(0x2f80ed, 1.2, 30);
  blue.position.set(-6, 3, 2);
  scene.add(blue);

  // 자판기 실루엣 (배경)
  const machine = new THREE.Mesh(
    new THREE.BoxGeometry(3, 5, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.8, roughness: 0.4 }),
  );
  machine.position.set(0, 0, -2);
  scene.add(machine);

  // 떠다니는 상품 큐브들
  const cubes: { m: THREE.Mesh; sp: number; ph: number }[] = [];
  const group = new THREE.Group();
  scene.add(group);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.35),
      new THREE.MeshStandardMaterial({ color: PALETTE[i % PALETTE.length], roughness: 0.4, metalness: 0.15 }),
    );
    const a = (i / 14) * Math.PI * 2;
    const rad = 4 + (i % 3);
    m.position.set(Math.cos(a) * rad, (i % 5) - 2, Math.sin(a) * rad - 2);
    group.add(m);
    cubes.push({ m, sp: 0.2 + (i % 4) * 0.1, ph: i });
  }

  // ── 관리자 기능 (기존 로직 재사용) ──
  const unsubAdmin = renderAdmin(fg);

  // ── 루프 ──
  const clock = new THREE.Clock();
  let disposed = false;
  function loop() {
    if (disposed) return;
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.1;
    machine.rotation.y = Math.sin(t * 0.2) * 0.2;
    for (const c of cubes) {
      c.m.rotation.x = t * c.sp;
      c.m.rotation.y = t * c.sp * 0.7;
      c.m.position.y += Math.sin(t + c.ph) * 0.002;
    }
    renderer.render(scene, camera);
  }
  loop();

  function resize() {
    const w = wrap.clientWidth || 1;
    const hgt = wrap.clientHeight || 1;
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hgt);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  return () => {
    disposed = true;
    ro.disconnect();
    unsubAdmin();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
