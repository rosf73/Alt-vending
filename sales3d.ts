// 판매 화면 (3D) — Three.js로 렌더한 자판기 (spec §8.3.2 결정). 표현부만 3D이며
// 상태/규칙은 서버 MachineView를 표시·명령만 한다 (R9). 3×3 그리드·최종가 색상·배출 낙하 유지.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as api from './client.js';
import type { MachineView, ProductView } from './client.js';
import { errorMessage, h, toast, won } from './ui.js';

const DENOMS = [
  { denom: 100, src: '/resources/100.png' },
  { denom: 500, src: '/resources/500.png' },
  { denom: 1000, src: '/resources/1000.jpeg' },
];
const AUTO_RETURN_SEC = 10;

// 3×3 그리드 좌표 (선반) — 열 x, 행 y
const COLS = [-1.15, -0.5, 0.15];
const ROWS = [1.45, 0.35, -0.75];
const CUBE = 0.5;
const FRONT_Z = 0.72; // 상품이 놓이는 전면 깊이
const TRAY_POS = new THREE.Vector3(-0.5, -2.15, 0.9); // 배출 트레이 착지 지점

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  label: CSS2DObject;
  el: HTMLDivElement;
  id: string | null;
}

// 간단 트윈 (프레임 delta 기반) — 배출 낙하/코인 애니메이션용
interface Tween {
  t: number;
  dur: number;
  update: (p: number) => void;
  done?: () => void;
}

export function renderSales3D(root: HTMLElement): () => void {
  root.replaceChildren();
  const screen = h('div', { class: 'sales3d' });
  const canvasWrap = h('div', { class: 'canvas-wrap' });
  const tray = h('div', { class: 'tray' });
  screen.append(canvasWrap, tray);
  root.append(screen);

  // ── Three.js 기본 셋업 ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);
  scene.fog = new THREE.Fog(0x0c0d10, 10, 20);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  // 시작 구도: 정면이 아니라 좌상단 상공에서 자판기를 내려다보는 구도 (spec §8.3.2)
  camera.position.set(-4.2, 5.6, 4.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasWrap.append(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'css2d-layer';
  canvasWrap.append(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.2, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5.5;
  controls.maxDistance = 11;
  // 좌상단 상공 시작 구도가 유효하도록 각도 범위 확장 (내려다보기 허용)
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.minAzimuthAngle = -1.3;
  controls.maxAzimuthAngle = 1.0;
  controls.autoRotate = false; // 시작 구도(좌상단 내려다보기)를 고정 유지
  controls.autoRotateSpeed = 0.6;
  controls.update();

  // ── 조명 ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(4, 6, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-3, 1, 5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x88bbff, 0.7);
  rim.position.set(-5, 2, -3);
  scene.add(rim);

  // ── 자판기 본체 ──
  const machine = new THREE.Group();
  scene.add(machine);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x24272d, metalness: 0.75, roughness: 0.35 });
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.4, 1.4), bodyMat);
  cabinet.receiveShadow = true;
  machine.add(cabinet);

  // 상품 진열 캐비티 (좌측, 어두운 안쪽)
  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 4.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.4, roughness: 0.9 }),
  );
  cavity.position.set(-0.5, 0.35, 0.46);
  machine.add(cavity);

  // 전면 유리
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, 4.5, 0.06),
    new THREE.MeshPhysicalMaterial({
      color: 0xaad4ff,
      metalness: 0,
      roughness: 0.05,
      transmission: 0.9,
      transparent: true,
      opacity: 0.25,
      thickness: 0.5,
    }),
  );
  glass.position.set(-0.5, 0.35, 0.76);
  machine.add(glass);

  // 우측 컨트롤 패널 (약간 돌출)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 4.5, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x2f333b, metalness: 0.6, roughness: 0.4 }),
  );
  panel.position.set(1.12, 0.35, 0.72);
  machine.add(panel);

  // LED 잔액 패널
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x0b3d0b,
    emissive: 0x0b3d0b,
    emissiveIntensity: 0.6,
    metalness: 0.2,
    roughness: 0.6,
  });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.06), ledMat);
  led.position.set(1.12, 1.75, 0.8);
  machine.add(led);
  const ledGlow = new THREE.PointLight(0x7cfc7c, 0.8, 3);
  ledGlow.position.set(1.12, 1.75, 1.2);
  machine.add(ledGlow);

  // 투입구 (동전 슬롯)
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.09, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.3 }),
  );
  slot.position.set(1.12, 0.95, 0.82);
  machine.add(slot);

  // 반환 버튼 (raycast 대상)
  const refundMat = new THREE.MeshStandardMaterial({ color: 0xeb5757, emissive: 0x3a0000, roughness: 0.5 });
  const refundBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 32), refundMat);
  refundBtn.rotation.x = Math.PI / 2;
  refundBtn.position.set(1.12, 0.2, 0.85);
  refundBtn.userData.role = 'refund';
  machine.add(refundBtn);
  const refundLabelEl = h('div', { class: 'label3d refund-label', text: '반환' });
  const refundLabel = new CSS2DObject(refundLabelEl);
  refundLabel.position.set(1.12, -0.15, 0.9);
  machine.add(refundLabel);

  // 배출 트레이 (좌하단 개구부)
  const trayMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.9, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.5, roughness: 0.8 }),
  );
  trayMesh.position.set(-0.5, -2.15, 0.55);
  machine.add(trayMesh);
  const trayGlow = new THREE.PointLight(0x7cfc7c, 0, 2.5);
  trayGlow.position.copy(TRAY_POS);
  machine.add(trayGlow);

  // 바닥 그림자 받이
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.9;
  floor.receiveShadow = true;
  scene.add(floor);

  // LED 잔액 라벨 (CSS2D)
  const balanceEl = h('div', { class: 'balance3d', text: '₩0' });
  const balanceLabel = new CSS2DObject(balanceEl);
  balanceLabel.position.set(1.12, 1.75, 0.85);
  machine.add(balanceLabel);

  // 상태 라벨
  const statusEl = h('div', { class: 'status3d' });
  const statusLabel = new CSS2DObject(statusEl);
  statusLabel.position.set(-0.5, -2.75, 0.9);
  machine.add(statusLabel);

  // ── 상품 슬롯 3×3 ──
  const slots: Slot[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.45, metalness: 0.1 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE * 1.35, CUBE * 0.6), mat);
      mesh.position.set(COLS[c], ROWS[r], FRONT_Z);
      mesh.castShadow = true;
      mesh.visible = false;
      machine.add(mesh);
      const el = h('div', { class: 'prod3d' });
      const label = new CSS2DObject(el);
      label.position.set(COLS[c], ROWS[r] - CUBE * 1.0, FRONT_Z);
      machine.add(label);
      slots.push({ mesh, mat, label, el, id: null });
    }
  }

  // ── 화폐 트레이 (HTML, 드래그/클릭 투입 유지 §5.7·6.2) ──
  for (const { denom, src } of DENOMS) {
    const img = h('img', { src, alt: `${denom}원`, draggable: 'false' });
    const chip = h('div', {
      class: 'chip',
      draggable: 'true',
      role: 'button',
      tabindex: '0',
      title: `${denom.toLocaleString()}원 투입`,
    }, [img]);
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/denom', String(denom));
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    chip.addEventListener('click', () => doInsert(denom));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doInsert(denom);
      }
    });
    tray.append(chip);
  }
  // 캔버스(3D 자판기) 위로 드롭 → 투입
  canvasWrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvasWrap.classList.add('drop-over');
  });
  canvasWrap.addEventListener('dragleave', () => canvasWrap.classList.remove('drop-over'));
  canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    canvasWrap.classList.remove('drop-over');
    const denom = Number(e.dataTransfer?.getData('text/denom'));
    if (denom) doInsert(denom);
  });

  async function doInsert(denom: number) {
    const r = await api.insertMoney(denom);
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'danger');
    else spawnCoin();
  }
  async function doPurchase(id: string) {
    const r = await api.purchase(id);
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'warning');
  }

  // ── 레이캐스트 클릭 (상품/반환) ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // 드래그(회전)면 무시
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const targets = [refundBtn, ...slots.filter((s) => s.id && s.mesh.visible).map((s) => s.mesh)];
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;
    if (hit.object === refundBtn) {
      void doRefund();
      return;
    }
    const slotHit = slots.find((s) => s.mesh === hit.object);
    if (slotHit?.id && slotHit.mesh.userData.buyable) void doPurchase(slotHit.id);
  });

  async function doRefund() {
    const r = await api.refund();
    if (!r.ok && r.error) toast(errorMessage(String(r.error)), 'danger');
  }

  // ── 트윈 관리 ──
  const tweens: Tween[] = [];
  function addTween(dur: number, update: (p: number) => void, done?: () => void) {
    tweens.push({ t: 0, dur, update, done });
  }
  function spawnCoin() {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.03, 24),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }),
    );
    coin.rotation.z = Math.PI / 2;
    const from = new THREE.Vector3(1.12, 2.6, 1.4);
    const to = new THREE.Vector3(1.12, 0.98, 0.9);
    coin.position.copy(from);
    machine.add(coin);
    addTween(
      0.5,
      (p) => {
        coin.position.lerpVectors(from, to, p);
        coin.rotation.y += 0.4;
      },
      () => machine.remove(coin),
    );
  }
  function dropProduct(color: string, fromPos: THREE.Vector3) {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(CUBE, CUBE * 1.35, CUBE * 0.6),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 }),
    );
    cube.castShadow = true;
    cube.position.copy(fromPos);
    machine.add(cube);
    trayGlow.intensity = 1.2;
    const mid = fromPos.clone().lerp(TRAY_POS, 0.5);
    addTween(
      1.1,
      (p) => {
        // 회전하며 낙하 + 착지 바운스 (§6.3)
        const e = p * p; // ease-in (중력 느낌)
        cube.position.x = THREE.MathUtils.lerp(fromPos.x, TRAY_POS.x, p);
        cube.position.z = THREE.MathUtils.lerp(fromPos.z, TRAY_POS.z, p);
        let y = THREE.MathUtils.lerp(fromPos.y, TRAY_POS.y, e);
        if (p > 0.86) y = TRAY_POS.y + Math.sin((p - 0.86) / 0.14 * Math.PI) * 0.18; // 바운스 1회
        cube.position.y = y;
        cube.rotation.x = p * Math.PI * 2.2;
        cube.rotation.z = p * Math.PI * 1.4;
      },
      () => {
        cube.rotation.set(0, 0, 0);
        cube.position.copy(TRAY_POS);
        setTimeout(() => {
          machine.remove(cube);
          trayGlow.intensity = 0;
        }, 1400);
      },
    );
    void mid;
  }

  // ── 상태 반영 ──
  let prev: MachineView | null = null;
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
    statusEl.className = 'status3d';
    if (v.state === 'DISPENSING') statusEl.textContent = '배출 중...';
    else if (v.state === 'RETURNING') statusEl.textContent = '반환 중...';
    else if (v.state === 'ACTIVE' && countdownTimer) statusEl.innerHTML = `잔여 <b>${countdown}s</b> 후 자동 반환`;
    else statusEl.textContent = v.state === 'IDLE' ? '현금을 투입하세요' : '';
  }

  function syncProducts(v: MachineView) {
    for (let i = 0; i < 9; i++) {
      const slot = slots[i];
      const p: ProductView | undefined = v.products[i];
      if (!p) {
        slot.mesh.visible = false;
        slot.el.style.display = 'none';
        slot.id = null;
        continue;
      }
      slot.id = p.id;
      slot.mesh.visible = true;
      slot.el.style.display = '';
      const buyable = p.purchasability === 'AVAILABLE';
      slot.mesh.userData.buyable = buyable;
      // 색/상태
      if (p.purchasability === 'SOLD_OUT') {
        slot.mat.color.set(0x555555);
        slot.mat.emissive.set(0x000000);
        slot.mat.opacity = 0.4;
        slot.mat.transparent = true;
      } else {
        slot.mat.color.set(p.color);
        slot.mat.opacity = 1;
        slot.mat.transparent = false;
        slot.mat.emissive.set(buyable ? 0x1a5c2f : 0x000000);
        slot.mat.emissiveIntensity = buyable ? 0.5 : 0;
      }
      // 라벨 (이름/재고/최종가 색상)
      const priceHtml =
        p.purchasability === 'SOLD_OUT'
          ? `<span class="p sold">${won(p.effectivePrice)}</span>`
          : p.promoApplied && p.promoDiscount > 0
            ? `<span class="orig">${won(p.basePrice + p.dynamicRaise)}</span><span class="p ${p.priceColor}">${won(p.effectivePrice)}</span>`
            : `<span class="p ${p.priceColor}">${won(p.effectivePrice)}</span>`;
      slot.el.className = `prod3d ${buyable ? 'buyable' : ''} ${p.purchasability === 'SOLD_OUT' ? 'sold' : ''}`;
      slot.el.innerHTML = `<div class="nm">${p.name}</div><div class="q">${p.qty > 0 ? '재고 ' + p.qty : '품절'}</div>${priceHtml}`;
    }
  }

  function apply(v: MachineView) {
    // 배출 판정 (DISPENSING → 종료): revenue/미반환금 델타
    if (prev && prev.state === 'DISPENSING' && v.state !== 'DISPENSING') {
      const pid = prev.pendingDispense?.productId;
      const idx = v.products.findIndex((p) => p.id === pid);
      const product = v.products.find((p) => p.id === pid);
      if (v.revenue > prev.revenue) {
        const from = idx >= 0 && idx < 9 ? slots[idx].mesh.position.clone() : new THREE.Vector3(-0.5, 1, FRONT_Z);
        dropProduct(product?.color ?? '#888', from);
        toast(`${product?.name ?? '상품'} 배출 완료!`, 'success');
      } else if (v.unreturnedFail > prev.unreturnedFail) {
        // 배출 실패: 트레이 흔들림 + danger
        const base = trayMesh.position.x;
        addTween(0.4, (p) => (trayMesh.position.x = base + Math.sin(p * Math.PI * 6) * 0.08), () => (trayMesh.position.x = base));
        toast('배출 실패 — 사용 금액이 반환되지 않았습니다', 'danger');
      }
    }
    if (prev && v.totalReturned > prev.totalReturned) {
      toast(`${won(v.totalReturned - prev.totalReturned)} 반환되었습니다`, 'success');
    }

    balanceEl.textContent = won(v.balance);

    if (v.state === 'ACTIVE') {
      if (!prev || prev.state !== 'ACTIVE' || prev.balance !== v.balance) startCountdown();
    } else {
      stopCountdown();
    }

    syncProducts(v);
    renderStatus();
    prev = v;
  }

  // ── 애니메이션 루프 ──
  const clock = new THREE.Clock();
  let disposed = false;
  function loop() {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.update(p);
      if (p >= 1) {
        tw.done?.();
        tweens.splice(i, 1);
      }
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  loop();

  // ── 리사이즈 ──
  function resize() {
    const w = canvasWrap.clientWidth || 1;
    const hgt = canvasWrap.clientHeight || 1;
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hgt);
    labelRenderer.setSize(w, hgt);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasWrap);
  resize();

  const unsub = api.onState(apply);

  return () => {
    disposed = true;
    stopCountdown();
    ro.disconnect();
    unsub();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  };
}
