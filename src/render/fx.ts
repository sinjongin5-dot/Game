import * as THREE from 'three';

/** 피격 시 캐릭터 전체가 순간적으로 밝아지는 정도 (0..1). 재질 셰이더가 읽는다. */
export const HIT_FLASH = { lion: { value: 0 }, player: { value: 0 } };

/** 재질 셰이더가 읽는 공용 조명 값: 태양 방향(뷰 공간, 정규화) — 장면이 매 프레임 갱신한다 */
export const LIGHTING = { sunView: { value: new THREE.Vector3(0.3, 0.8, -0.5) } };

/** MeshStandardMaterial 의 onBeforeCompile 셰이더에 피격 플래시를 끼워 넣는다. */
export function injectHitFlash(sh: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, who: 'lion' | 'player', color: [number, number, number]) {
  sh.uniforms.uHitFlash = HIT_FLASH[who];
  const c = color.map((v) => v.toFixed(3)).join(',');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uHitFlash;')
    .replace('#include <opaque_fragment>', `outgoingLight += vec3(${c}) * uHitFlash;\n#include <opaque_fragment>`);
}

// ── 텍스처 (캔버스로 생성) ───────────────────────────────────────────────────
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture() {
  return canvasTex(128, (g, s) => {
    const h = s / 2;
    const rg = g.createRadialGradient(h, h, 0, h, h, h);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.18, 'rgba(255,240,210,0.85)');
    rg.addColorStop(0.5, 'rgba(255,170,90,0.22)');
    rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    // 십자 광선
    g.globalCompositeOperation = 'lighter';
    for (const horizontal of [true, false]) {
      const lg = horizontal ? g.createLinearGradient(0, h, s, h) : g.createLinearGradient(h, 0, h, s);
      lg.addColorStop(0, 'rgba(255,200,120,0)');
      lg.addColorStop(0.5, 'rgba(255,255,240,0.95)');
      lg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = lg;
      if (horizontal) g.fillRect(0, h - 2.5, s, 5); else g.fillRect(h - 2.5, 0, 5, s);
    }
  });
}

function streakTexture() {
  return canvasTex(256, (g, s) => {
    const h = s / 2;
    const lg = g.createLinearGradient(0, 0, s, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.55, 'rgba(255,245,220,0.9)');
    lg.addColorStop(0.9, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    // 가운데가 가장 두껍고 양 끝이 뾰족한 칼날 모양
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, h);
    g.quadraticCurveTo(s * 0.7, h - 22, s, h);
    g.quadraticCurveTo(s * 0.7, h + 22, 0, h);
    g.fill();
  });
}

function glowTexture() {
  return canvasTex(64, (g, s) => {
    const h = s / 2;
    const rg = g.createRadialGradient(h, h, 0, h, h, h);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
  });
}

interface Flash { s: THREE.Sprite; life: number; max: number; size: number; grow: number; spin: number }
interface Streak { s: THREE.Sprite; life: number; max: number; len: number; wid: number }
interface Ring {
  mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; r0: number; r1: number; width: number; alpha: number; active: boolean; scale: number;
}

const ringVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ringFrag = `
varying vec2 vUv;
uniform float uR; uniform float uW; uniform float uA; uniform vec3 uColor; uniform float uSeed;
float h(float n){ return fract(sin(n * 12.9898 + uSeed) * 43758.5453); }
float vn(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float ang = atan(p.y, p.x);
  float n = 0.55 + 0.45 * vn(ang * 5.0 + 3.0) * vn(ang * 13.0);
  float edge = smoothstep(uW, 0.0, abs(d - uR));
  float haze = smoothstep(uR, uR - uW * 5.0, d) * step(d, uR);
  float a = (edge * n + haze * 0.28 * n) * uA;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.82, 0.68, 0.46), uColor, clamp(edge, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;

/** 짧게 사라지는 시각 효과 모음 (충격파 링, 번쩍임, 베기 줄기, 눈빛 등) */
export class Fx {
  readonly group = new THREE.Group();
  private flashes: Flash[] = [];
  private streaks: Streak[] = [];
  private rings: Ring[] = [];
  private flashTex = starTexture();
  private streakTex = streakTexture();
  private glowTex = glowTexture();
  private eyes: THREE.Sprite[] = [];
  private eyeLevel = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 12;
      this.group.add(s);
      this.flashes.push({ s, life: 0, max: 1, size: 1, grow: 1, spin: 0 });
    }
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.streakTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 11;
      this.group.add(s);
      this.streaks.push({ s, life: 0, max: 1, len: 1, wid: 0.1 });
    }
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uR: { value: 0 }, uW: { value: 0.05 }, uA: { value: 1 }, uColor: { value: new THREE.Color(1, 0.9, 0.7) }, uSeed: { value: i * 7.3 } },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.07;
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 1, r0: 0, r1: 1, width: 1, alpha: 1, active: false, scale: 1 });
    }
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(1.0, 0.3, 0.08), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 9;
      this.group.add(s);
      this.eyes.push(s);
    }
  }

  clear() {
    for (const f of this.flashes) { f.life = 0; f.s.visible = false; }
    for (const f of this.streaks) { f.life = 0; f.s.visible = false; }
    for (const r of this.rings) { r.active = false; r.mesh.visible = false; }
    this.eyeLevel = 0;
    for (const e of this.eyes) e.visible = false;
  }

  /** 충돌 번쩍임: 별 모양 섬광 */
  flash(pos: THREE.Vector3, size: number, color: THREE.ColorRepresentation = 0xffe2b0, life = 0.14) {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.life = f.max = life;
    f.size = size;
    f.grow = 1.7;
    f.spin = (Math.random() - 0.5) * 3;
    f.s.position.copy(pos);
    (f.s.material as THREE.SpriteMaterial).color.set(color);
    (f.s.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
    f.s.visible = true;
  }

  /** 베기 줄기: 화면상 angle(라디안) 방향으로 길게 뻗는 칼날 모양 빛 */
  streak(pos: THREE.Vector3, screenAngle: number, length: number, width: number, color: THREE.ColorRepresentation = 0xfff0d0, life = 0.16) {
    const s = this.streaks.find((x) => x.life <= 0) ?? this.streaks[0];
    s.life = s.max = life;
    s.len = length;
    s.wid = width;
    s.s.position.copy(pos);
    const m = s.s.material as THREE.SpriteMaterial;
    m.color.set(color);
    m.rotation = screenAngle;
    s.s.scale.set(length, width, 1);
    s.s.visible = true;
  }

  /** 월드 방향 dir 을 카메라 화면상의 각도로 바꿔 베기 줄기를 그린다 */
  streakWorld(pos: THREE.Vector3, dir: THREE.Vector3, cam: THREE.Camera, length: number, width: number, color?: THREE.ColorRepresentation, life?: number) {
    const a = this.tmp.copy(pos).project(cam);
    const b = this.tmp2.copy(pos).addScaledVector(dir, 0.5).project(cam);
    const ang = Math.atan2(b.y - a.y, (b.x - a.x) * (cam as THREE.PerspectiveCamera).aspect);
    this.streak(pos, ang, length, width, color, life);
  }

  /** 지면을 따라 퍼지는 충격파 링 */
  shock(x: number, z: number, r0: number, r1: number, dur: number, width = 1.0, color: THREE.ColorRepresentation = 0xffe9c0, alpha = 0.9) {
    const r = this.rings.find((x2) => !x2.active) ?? this.rings[0];
    r.active = true;
    r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.width = width; r.alpha = alpha;
    r.scale = r1 + width * 1.6;
    r.mesh.scale.setScalar(r.scale);
    r.mesh.position.set(x, 0.07, z);
    (r.mat.uniforms.uColor.value as THREE.Color).set(color);
    r.mat.uniforms.uSeed.value = Math.random() * 100;
    r.mesh.visible = true;
  }

  /** 사자 눈빛: 기본(2페이즈), 공격 전조(windup) 때 강하게 번뜩인다 */
  setEyeGlow(head: THREE.Vector3, yaw: number, level: number, visible: boolean) {
    this.eyeLevel += (level - this.eyeLevel) * 0.25;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw); // 사자 왼쪽(+x 로컬) → 월드
    for (let i = 0; i < 2; i++) {
      const e = this.eyes[i];
      const side = i === 0 ? 1 : -1;
      e.visible = visible && this.eyeLevel > 0.02;
      if (!e.visible) continue;
      e.position.set(head.x + fx * 0.3 + sx * 0.125 * side, head.y + 0.1, head.z + fz * 0.3 + sz * 0.125 * side);
      const k = this.eyeLevel;
      e.scale.setScalar(0.07 + 0.22 * k);
      (e.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.25 + k);
    }
  }

  update(dt: number) {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.s.visible = false; continue; }
      const u = 1 - f.life / f.max;
      const sc = f.size * (0.5 + f.grow * Math.sqrt(u));
      f.s.scale.set(sc, sc, 1);
      (f.s.material as THREE.SpriteMaterial).opacity = (1 - u) * (1 - u) * 1.2;
    }
    for (const s of this.streaks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.s.visible = false; continue; }
      const u = 1 - s.life / s.max;
      s.s.scale.set(s.len * (0.55 + 0.6 * u), s.wid * (1 - u * 0.6), 1);
      (s.s.material as THREE.SpriteMaterial).opacity = (1 - u) * 1.1;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - Math.min(1, u * 1.15), 1.6);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      r.mat.uniforms.uR.value = rad / r.scale;
      r.mat.uniforms.uW.value = (r.width * 0.5 * (1 - u * 0.5)) / r.scale;
      r.mat.uniforms.uA.value = r.alpha * (1 - u * u);
    }
  }
}
