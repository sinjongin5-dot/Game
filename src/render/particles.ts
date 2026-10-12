import * as THREE from 'three';

type Kind = 'dust' | 'spark' | 'chip';

interface PSystem {
  points: THREE.Points;
  cap: number;
  pos: Float32Array; vel: Float32Array; life: Float32Array; maxLife: Float32Array; size: Float32Array; col: Float32Array; alpha: Float32Array;
  grow: Float32Array; drag: Float32Array; grav: Float32Array; a0: Float32Array;
  next: number;
  geo: THREE.BufferGeometry;
}

const vert = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC; uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vA = aAlpha; vC = aColor;
}`;
const fragDust = /* glsl */ `
varying float vA; varying vec3 vC;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float n = h(floor(gl_PointCoord * 6.0)) * 0.25;
  float a = smoothstep(1.0, 0.25, r + n * 0.35) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC, a);
}`;
const fragSpark = /* glsl */ `
varying float vA; varying vec3 vC;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a = smoothstep(1.0, 0.0, r) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC * (1.0 + a), a);
}`;

export class Particles {
  readonly group = new THREE.Group();
  private systems: Record<Kind, PSystem>;
  private scaleU = { value: 800 };
  lightColor = new THREE.Color(1, 1, 1);

  constructor() {
    this.systems = {
      dust: this.make(900, fragDust, THREE.NormalBlending),
      spark: this.make(420, fragSpark, THREE.AdditiveBlending),
      chip: this.make(320, fragDust, THREE.NormalBlending),
    };
  }

  private make(cap: number, frag: string, blending: THREE.Blending): PSystem {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap), col = new Float32Array(cap * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending, uniforms: { uScale: this.scaleU },
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    this.group.add(points);
    return {
      points, cap, pos, size, alpha, col, geo, next: 0,
      vel: new Float32Array(cap * 3), life: new Float32Array(cap), maxLife: new Float32Array(cap).fill(1),
      grow: new Float32Array(cap), drag: new Float32Array(cap), grav: new Float32Array(cap), a0: new Float32Array(cap),
    };
  }

  private spawn(k: Kind, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, color: THREE.Color, alpha: number, drag: number, grav: number) {
    const s = this.systems[k];
    const i = s.next;
    s.next = (s.next + 1) % s.cap;
    s.pos.set([p.x, p.y, p.z], i * 3);
    s.vel.set([v.x, v.y, v.z], i * 3);
    s.life[i] = s.maxLife[i] = life;
    s.size[i] = size;
    s.grow[i] = grow;
    s.col.set([color.r, color.g, color.b], i * 3);
    s.alpha[i] = alpha;
    s.a0[i] = alpha;
    s.drag[i] = drag;
    s.grav[i] = grav;
  }

  private static sand = new THREE.Color(0.7, 0.57, 0.38);
  private static sandL = new THREE.Color(0.82, 0.7, 0.5);

  /** 햇살 속에 떠다니는 미세 먼지(대기감). 느리게 흩날린다 */
  mote(pos: THREE.Vector3) {
    this.spawn('dust', pos, new THREE.Vector3((Math.random() - 0.3) * 0.35, (Math.random() - 0.4) * 0.12, (Math.random() - 0.5) * 0.3),
      5 + Math.random() * 4, 0.035 + Math.random() * 0.04, 0.0, new THREE.Color(1.0, 0.86, 0.62), 0.22 + Math.random() * 0.2, 0.3, 0);
  }

  /** 발걸음/착지 먼지. strength 0..1 */
  puff(pos: THREE.Vector3, strength: number, dir?: THREE.Vector3, count = 0) {
    const n = count || Math.max(1, Math.round(2 + strength * 6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random() * 1.1) * (0.5 + strength);
      const v = new THREE.Vector3(Math.cos(a) * sp * 0.6 + (dir ? dir.x * 0.6 : 0), 0.25 + Math.random() * 0.7 * strength, Math.sin(a) * sp * 0.6 + (dir ? dir.z * 0.6 : 0));
      this.spawn('dust', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2)), v,
        0.7 + Math.random() * 0.9, 0.35 + strength * 0.6 + Math.random() * 0.25, 0.7 + strength * 0.8, Math.random() < 0.5 ? Particles.sand : Particles.sandL, 0.2 * (0.5 + strength), 1.9, -0.25);
    }
  }

  /** 도약 착지/충격파: 링 형태 먼지 */
  ring(pos: THREE.Vector3, radius: number, count = 36) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
      const sp = 2.4 + Math.random() * 2.2;
      this.spawn('dust', pos.clone().add(new THREE.Vector3(Math.cos(a) * radius * 0.3, 0.08, Math.sin(a) * radius * 0.3)),
        new THREE.Vector3(Math.cos(a) * sp, 1.0 + Math.random() * 1.6, Math.sin(a) * sp), 0.9 + Math.random() * 0.8, 0.5 + Math.random() * 0.4, 1.2, Particles.sand, 0.16, 2.4, -0.5);
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      this.spawn('chip', pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2.5, Math.sin(a) * sp), 0.6 + Math.random() * 0.4, 0.09, 0, Particles.sandL, 0.9, 0.2, 9);
    }
  }

  /** 칼/방패 충격 불꽃 */
  sparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number, color = new THREE.Color(1.0, 0.7, 0.3)) {
    for (let i = 0; i < count; i++) {
      const v = normal.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.spawn('spark', pos, v, 0.18 + Math.random() * 0.25, 0.07 + Math.random() * 0.05, -0.04, color, 1.0, 1.2, 8);
    }
  }

  /** 털 조각/먼지 (사자 피격) */
  furBurst(pos: THREE.Vector3, normal: THREE.Vector3, count = 14) {
    for (let i = 0; i < count; i++) {
      const v = normal.clone().multiplyScalar(0.8 + Math.random() * 1.8).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
      this.spawn('dust', pos, v, 0.8 + Math.random() * 0.8, 0.28 + Math.random() * 0.22, 0.5, new THREE.Color(0.72, 0.52, 0.28), 0.34, 2.2, -0.15);
    }
  }

  /** 돌 파편 + 먼지 (벽 충돌) */
  debris(pos: THREE.Vector3, count = 36) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
      this.spawn('chip', pos, new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp), 0.8 + Math.random() * 0.7, 0.1 + Math.random() * 0.1, 0, new THREE.Color(0.7, 0.62, 0.5), 1.0, 0.3, 9.8);
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 3;
      this.spawn('dust', pos.clone().add(new THREE.Vector3(0, 0.5 + Math.random(), 0)), new THREE.Vector3(Math.cos(a) * sp, Math.random() * 1.6, Math.sin(a) * sp), 1.4 + Math.random() * 1.2, 1.0 + Math.random() * 1.2, 1.2, new THREE.Color(0.7, 0.64, 0.54), 0.4, 1.4, -0.1);
    }
  }

  /** 위로 떠오르는 불씨 (2페이즈 사자 주변 등) */
  ember(pos: THREE.Vector3, count: number, spread = 0.8, color = new THREE.Color(1.0, 0.42, 0.1)) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const p = pos.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 0.9, Math.sin(a) * r));
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.1, (Math.random() - 0.5) * 0.6);
      this.spawn('spark', p, v, 0.7 + Math.random() * 0.9, 0.05 + Math.random() * 0.05, -0.03, color, 0.9, 0.6, -0.8);
    }
  }

  /** 제자리 회전 공격의 모래 소용돌이 (center 둘레를 회전) */
  swirl(center: THREE.Vector3, radius: number, count: number, spin: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.7 + Math.random() * 0.5);
      const p = center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.05 + Math.random() * 0.3, Math.sin(a) * r));
      const tang = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(spin * (4 + Math.random() * 3));
      tang.y = 0.6 + Math.random() * 1.2;
      this.spawn('dust', p, tang, 0.6 + Math.random() * 0.6, 0.45 + Math.random() * 0.4, 0.9, Math.random() < 0.5 ? Particles.sand : Particles.sandL, 0.18, 1.4, -0.2);
    }
  }


  // ── 전투 연출용 (임시 객체 없이 재사용) ──────────────────────────────────────
  private static steelHot = new THREE.Color(1.6, 1.45, 1.2);
  private static steelCool = new THREE.Color(0.95, 1.1, 1.5);
  private static emberHot = new THREE.Color(1.5, 0.8, 0.32);
  private static blood = new THREE.Color(0.2, 0.025, 0.03);
  private static stone = new THREE.Color(0.55, 0.53, 0.5);
  private static stoneDark = new THREE.Color(0.32, 0.31, 0.3);
  private static ashDust = new THREE.Color(0.52, 0.48, 0.42);
  private tv = new THREE.Vector3();
  private tp = new THREE.Vector3();

  /**
   * 금속 충돌 불꽃: dir(정규화된 충돌 법선 쪽) 으로 원뿔처럼 튀며, 일부는 따뜻한 주황으로 식는다.
   * spread 0..1 (클수록 넓게)
   */
  metalSparks(pos: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number, spread: number, warm = 0.35) {
    for (let i = 0; i < count; i++) {
      const sp = speed * (0.45 + Math.random() * 0.9);
      this.tv.set(dir.x + (Math.random() - 0.5) * 2 * spread, dir.y + (Math.random() - 0.4) * 2 * spread, dir.z + (Math.random() - 0.5) * 2 * spread).normalize().multiplyScalar(sp);
      const c = Math.random() < warm ? Particles.emberHot : Math.random() < 0.5 ? Particles.steelHot : Particles.steelCool;
      this.spawn('spark', pos, this.tv, 0.14 + Math.random() * 0.26, 0.05 + Math.random() * 0.05, -0.05, c, 1.0, 1.6, 9.5);
    }
  }

  /** 짙은 붉은 핏방울/살점 (살에 맞았을 때만, 어둡고 절제된 양) */
  droplets(pos: THREE.Vector3, dir: THREE.Vector3, count: number, speed = 3.2) {
    for (let i = 0; i < count; i++) {
      const sp = speed * (0.4 + Math.random());
      this.tv.set(dir.x + (Math.random() - 0.5) * 1.2, dir.y * 0.5 + Math.random() * 0.8, dir.z + (Math.random() - 0.5) * 1.2).normalize().multiplyScalar(sp);
      this.spawn('chip', pos, this.tv, 0.45 + Math.random() * 0.45, 0.06 + Math.random() * 0.05, 0, Particles.blood, 0.95, 0.5, 10);
    }
  }

  /** 돌/바닥 파편 (지면이 실제로 맞았을 때) */
  shards(pos: THREE.Vector3, count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = power * (0.35 + Math.random());
      this.tv.set(Math.cos(a) * sp, power * (0.5 + Math.random() * 0.9), Math.sin(a) * sp);
      this.tp.set(pos.x + Math.cos(a) * 0.15, pos.y + 0.05, pos.z + Math.sin(a) * 0.15);
      this.spawn('chip', this.tp, this.tv, 0.6 + Math.random() * 0.6, 0.06 + Math.random() * 0.1, 0, Math.random() < 0.5 ? Particles.stone : Particles.stoneDark, 1.0, 0.25, 11);
    }
  }

  /**
   * 충격 먼지 벽: 중심에서 방사형으로 낮게 퍼지는 두꺼운 먼지 (지면 충돌 전용)
   */
  dustWave(center: THREE.Vector3, radius: number, count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.25;
      const sp = power * (0.7 + Math.random() * 0.7);
      this.tv.set(Math.cos(a) * sp, 0.25 + Math.random() * 0.9, Math.sin(a) * sp);
      this.tp.set(center.x + Math.cos(a) * radius * 0.25, center.y + 0.06, center.z + Math.sin(a) * radius * 0.25);
      this.spawn('dust', this.tp, this.tv, 0.9 + Math.random() * 0.9, 0.55 + Math.random() * 0.5, 1.4, Math.random() < 0.5 ? Particles.ashDust : Particles.sand, 0.2 + Math.random() * 0.1, 2.6, -0.3);
    }
  }

  /** 먼지가 천천히 가라앉는 후속 연출: 공중에 떠올랐다가 느리게 내려앉는다 */
  settleDust(center: THREE.Vector3, spread: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.tp.set(center.x + Math.cos(a) * r, center.y + 0.15 + Math.random() * 0.8, center.z + Math.sin(a) * r);
      this.tv.set((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.35, (Math.random() - 0.5) * 0.5);
      this.spawn('dust', this.tp, this.tv, 1.8 + Math.random() * 1.6, 0.7 + Math.random() * 0.6, 0.5, Particles.ashDust, 0.12 + Math.random() * 0.08, 0.9, 0.12);
    }
  }

  /** 방사형 불꽃 터짐 (큰 충격) */
  burst(pos: THREE.Vector3, count: number, speed: number, color = new THREE.Color(1.0, 0.8, 0.5)) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.spawn('spark', pos, v, 0.2 + Math.random() * 0.3, 0.08 + Math.random() * 0.06, -0.05, color, 1.0, 1.4, 9);
    }
  }

  /** 모래를 끌며 일으키는 연속 먼지 */
  trail(pos: THREE.Vector3, vel: THREE.Vector3, strength: number) {
    this.puff(pos, strength, vel.clone().multiplyScalar(-0.3), 2);
  }

  update(dt: number, viewportHeight: number, fovDeg: number) {
    this.scaleU.value = (viewportHeight * 0.5) / Math.tan((fovDeg * Math.PI) / 360);
    for (const k of Object.keys(this.systems) as Kind[]) {
      const s = this.systems[k];
      let any = false;
      for (let i = 0; i < s.cap; i++) {
        if (s.life[i] <= 0) {
          s.alpha[i] = 0;
          continue;
        }
        any = true;
        s.life[i] -= dt;
        const t = 1 - Math.max(0, s.life[i]) / s.maxLife[i];
        const drag = Math.exp(-s.drag[i] * dt);
        s.vel[i * 3] *= drag;
        s.vel[i * 3 + 2] *= drag;
        s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * drag - s.grav[i] * dt;
        s.pos[i * 3] += s.vel[i * 3] * dt;
        s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
        if (s.pos[i * 3 + 1] < 0.02 && k !== 'dust') { s.pos[i * 3 + 1] = 0.02; s.vel[i * 3 + 1] *= -0.25; }
        s.size[i] = Math.max(0.01, s.size[i] + s.grow[i] * dt);
        const fadeIn = Math.min(1, t * 8);
        s.alpha[i] = s.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
      }
      void any;
      (s.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (s.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
      (s.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
      (s.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  setLight(c: THREE.Color) {
    this.lightColor.copy(c);
  }

  clear() {
    for (const k of Object.keys(this.systems) as Kind[]) {
      const s = this.systems[k];
      s.life.fill(0);
      s.alpha.fill(0);
      s.a0.fill(0);
    }
  }
}
