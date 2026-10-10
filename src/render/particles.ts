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
      dust: this.make(700, fragDust, THREE.NormalBlending),
      spark: this.make(260, fragSpark, THREE.AdditiveBlending),
      chip: this.make(200, fragDust, THREE.NormalBlending),
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
