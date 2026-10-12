import * as THREE from 'three';

/** 검 궤적의 시각 언어. 공격 종류마다 색·두께·잔상 길이가 다르다 (차가운 강철빛이 기본, 따뜻한 색은 강한 공격에서만) */
export type SlashStyle = 'light' | 'finisher' | 'run' | 'heavy' | 'execute';

interface StyleDef {
  /** 날 끝(가장 밝은 가장자리) / 날 안쪽(옅은 가장자리) 색 (선형, HDR 허용) */
  core: [number, number, number];
  edge: [number, number, number];
  /** 샘플 수명(초): 길수록 잔상이 길다 */
  life: number;
  /** 날 시작 위치(0=손잡이쪽 … 1=칼끝): 클수록 리본이 얇아진다 */
  from: number;
  /** 칼끝 바깥으로 리본을 얼마나 더 뻗는지(m): 두껍고 강렬한 궤적 */
  extend: number;
  alpha: number;
  /** 어두운 연기 잔상 층(0 이면 없음) */
  smoke: number;
}

export const SLASH_STYLES: Record<SlashStyle, StyleDef> = {
  light: { core: [1.0, 1.0, 1.05], edge: [0.45, 0.6, 0.85], life: 0.13, from: 0.55, extend: 0.0, alpha: 0.62, smoke: 0 },
  finisher: { core: [1.15, 1.12, 1.05], edge: [0.55, 0.68, 0.92], life: 0.2, from: 0.3, extend: 0.14, alpha: 0.78, smoke: 0.25 },
  run: { core: [0.95, 1.05, 1.15], edge: [0.35, 0.55, 0.9], life: 0.19, from: 0.5, extend: 0.05, alpha: 0.6, smoke: 0 },
  heavy: { core: [1.55, 1.3, 1.0], edge: [0.62, 0.52, 0.45], life: 0.3, from: 0.0, extend: 0.3, alpha: 0.9, smoke: 0.5 },
  execute: { core: [1.8, 1.55, 1.3], edge: [0.7, 0.72, 0.9], life: 0.42, from: 0.0, extend: 0.4, alpha: 1.0, smoke: 0.6 },
};

const N = 30;

const VERT = /* glsl */ `
attribute float aA; attribute float aV; varying float vA; varying float vV;
void main(){ vA = aA; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_CORE = /* glsl */ `
varying float vA; varying float vV; uniform vec3 uCore; uniform vec3 uEdge; uniform float uAlpha;
void main(){
  // 칼끝 쪽 가장자리는 뜨겁고 선명하게, 안쪽은 투명하게 사라진다
  float tip = pow(clamp(vV, 0.0, 1.0), 2.2);
  float hot = smoothstep(0.82, 1.0, vV);
  vec3 c = mix(uEdge, uCore, tip) + uCore * hot * 0.9;
  float a = vA * (0.12 + tip) * uAlpha;
  gl_FragColor = vec4(c * a, a);
}`;
const FRAG_SMOKE = /* glsl */ `
varying float vA; varying float vV; uniform float uAlpha;
void main(){
  float a = vA * smoothstep(0.0, 0.7, vV) * (1.0 - smoothstep(0.85, 1.0, vV) * 0.5) * uAlpha;
  gl_FragColor = vec4(0.05, 0.06, 0.09, a);
}`;

interface Sample { ib: THREE.Vector3; ob: THREE.Vector3; age: number; k: number }

/** 하나의 검 궤적 리본(재사용). begin() 으로 스타일을 정하고 push() 로 매 프레임 검 위치를 넣는다. */
export class SlashTrail {
  readonly group = new THREE.Group();
  private samples: Sample[] = [];
  private pos = new Float32Array(N * 2 * 3);
  private aA = new Float32Array(N * 2);
  private aV = new Float32Array(N * 2);
  private geo = new THREE.BufferGeometry();
  private coreMat: THREE.ShaderMaterial;
  private smokeMat: THREE.ShaderMaterial;
  private smokeMesh: THREE.Mesh;
  private style: StyleDef = SLASH_STYLES.light;
  private lastTip = new THREE.Vector3();
  private hasLast = false;
  private tmpIn = new THREE.Vector3();
  private tmpOut = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private offIn = new THREE.Vector3();
  private offOut = new THREE.Vector3();
  private mid = new THREE.Vector3();
  /** 최근 칼끝 속력(m/s) */
  speed = 0;
  active = false;
  /** 끝났지만 잔상이 남아 있는가 */
  get visible() { return this.group.visible; }

  constructor() {
    for (let i = 0; i < N; i++) this.samples.push({ ib: new THREE.Vector3(), ob: new THREE.Vector3(), age: 1e3, k: 0 });
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.aA, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aV', new THREE.BufferAttribute(this.aV, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    for (let i = 0; i < N; i++) { this.aV[i * 2] = 0; this.aV[i * 2 + 1] = 1; }
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_CORE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCore: { value: new THREE.Vector3(1, 1, 1) }, uEdge: { value: new THREE.Vector3(0.5, 0.6, 0.9) }, uAlpha: { value: 1 } },
    });
    this.smokeMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_SMOKE, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
      uniforms: { uAlpha: { value: 0 } },
    });
    const core = new THREE.Mesh(this.geo, this.coreMat);
    this.smokeMesh = new THREE.Mesh(this.geo, this.smokeMat);
    for (const m of [core, this.smokeMesh]) { m.frustumCulled = false; }
    core.renderOrder = 7;
    this.smokeMesh.renderOrder = 6;
    this.group.add(this.smokeMesh, core);
    this.group.visible = false;
  }

  /** 새 휘두름 시작: 이전 잔상은 지우고 스타일을 정한다 */
  begin(style: SlashStyle, smokeEnabled = true) {
    this.style = SLASH_STYLES[style];
    const c = this.style;
    (this.coreMat.uniforms.uCore.value as THREE.Vector3).set(...c.core);
    (this.coreMat.uniforms.uEdge.value as THREE.Vector3).set(...c.edge);
    this.coreMat.uniforms.uAlpha.value = c.alpha;
    this.smokeMat.uniforms.uAlpha.value = smokeEnabled ? c.smoke : 0;
    this.smokeMesh.visible = smokeEnabled && c.smoke > 0;
    for (const s of this.samples) s.age = 1e3;
    this.hasLast = false;
    this.active = true;
    this.speed = 0;
  }

  end() { this.active = false; this.hasLast = false; }

  /**
   * 검의 현재 위치(손잡이쪽 base, 칼끝 tip)를 넣는다. dt 는 직전 호출 이후 경과 시간.
   * 프레임 사이 이동이 크면(저프레임) 중간 샘플을 보간해 끊어진 리본이 되지 않게 한다.
   */
  push(base: THREE.Vector3, tip: THREE.Vector3, dt: number) {
    if (!this.active) return;
    const c = this.style;
    let steps = 1;
    if (this.hasLast) {
      const d = this.lastTip.distanceTo(tip);
      this.speed = dt > 1e-4 ? d / dt : this.speed;
      steps = Math.min(6, Math.max(1, Math.ceil(d / 0.28)));
    }
    const k = THREE.MathUtils.clamp(this.speed / 11, 0.45, 1.35);
    this.tmpIn.copy(base).lerp(tip, c.from);
    this.tmpDir.copy(tip).sub(base).normalize();
    this.tmpOut.copy(tip).addScaledVector(this.tmpDir, c.extend * (0.55 + 0.45 * k));
    // 칼끝 기준 상대 위치(보간 단계마다 같은 오프셋을 쓴다)
    this.offIn.copy(this.tmpIn).sub(tip);
    this.offOut.copy(this.tmpOut).sub(tip);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const s = this.samples.pop()!;
      this.samples.unshift(s);
      if (this.hasLast && steps > 1) this.mid.copy(this.lastTip).lerp(tip, u); else this.mid.copy(tip);
      s.ib.copy(this.mid).add(this.offIn);
      s.ob.copy(this.mid).add(this.offOut);
      s.age = ((steps - i) / steps) * dt;
      s.k = k;
    }
    this.lastTip.copy(tip);
    this.hasLast = true;
  }

  update(dt: number) {
    const c = this.style;
    let any = false;
    for (let i = 0; i < N; i++) {
      const s = this.samples[i];
      s.age += dt;
      const f = Math.max(0, 1 - s.age / c.life);
      const a = f * f * s.k;
      this.pos[i * 6] = s.ib.x; this.pos[i * 6 + 1] = s.ib.y; this.pos[i * 6 + 2] = s.ib.z;
      this.pos[i * 6 + 3] = s.ob.x; this.pos[i * 6 + 4] = s.ob.y; this.pos[i * 6 + 5] = s.ob.z;
      this.aA[i * 2] = a; this.aA[i * 2 + 1] = a;
      if (f > 0) any = true;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aA') as THREE.BufferAttribute).needsUpdate = true;
    this.group.visible = any;
  }

  clear() {
    for (const s of this.samples) s.age = 1e3;
    this.active = false;
    this.hasLast = false;
    this.group.visible = false;
  }

  dispose() {
    this.geo.dispose();
    this.coreMat.dispose();
    this.smokeMat.dispose();
  }
}

/** 재사용 가능한 궤적 풀: 새 휘두름이 시작돼도 직전 궤적의 잔상은 끝까지 사라진다 */
export class SlashTrailPool {
  readonly group = new THREE.Group();
  private trails: SlashTrail[] = [];
  private cur: SlashTrail | null = null;
  smoke = true;

  constructor(count = 3) {
    for (let i = 0; i < count; i++) { const t = new SlashTrail(); this.trails.push(t); this.group.add(t.group); }
  }

  /** 현재 휘두르는 궤적 */
  get current() { return this.cur; }
  get activeCount() { return this.trails.filter((t) => t.visible).length; }
  get size() { return this.trails.length; }

  begin(style: SlashStyle): SlashTrail {
    this.cur?.end();
    // 비어 있는(안 보이는) 것을 우선, 없으면 가장 오래된(현재가 아닌) 것을 재사용
    const t = this.trails.find((x) => !x.visible && !x.active) ?? this.trails.find((x) => x !== this.cur) ?? this.trails[0];
    t.begin(style, this.smoke);
    this.cur = t;
    return t;
  }

  end() { this.cur?.end(); this.cur = null; }

  update(dt: number) { for (const t of this.trails) t.update(dt); }

  clear() { for (const t of this.trails) t.clear(); this.cur = null; }

  dispose() { for (const t of this.trails) t.dispose(); }
}
