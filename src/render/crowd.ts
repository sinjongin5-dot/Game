import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import { ellipseAt } from './arena';
import { mulberry32 } from './rand';
import type { SharedUniforms } from './proceduralMaterials';

function personGeometry(detail: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const addPart = (g: THREE.BufferGeometry, mask: number, arm: number, color: [number, number, number]) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('aMask', new THREE.Float32BufferAttribute(new Array(n).fill(mask), 1));
    g.setAttribute('aArm', new THREE.Float32BufferAttribute(new Array(n).fill(arm), 1));
    const cols: number[] = [];
    for (let i = 0; i < n; i++) cols.push(...color);
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const skin: [number, number, number] = [0.62, 0.42, 0.3];
  const torso = new THREE.CylinderGeometry(0.14, 0.2, 0.5, detail ? 14 : 8, 1);
  torso.translate(0, 0.4, 0);
  addPart(torso, 1, 0, [1, 1, 1]);
  const sho = new THREE.CapsuleGeometry(0.075, 0.28, 3, detail ? 8 : 5).rotateZ(Math.PI / 2).scale(1, 1, 1.45);
  sho.translate(0, 0.64, 0);
  addPart(sho, 1, 0, [0.95, 0.95, 0.95]);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8);
  neck.translate(0, 0.73, 0);
  addPart(neck, 0, 0, skin);
  const head = new THREE.SphereGeometry(0.095, detail ? 12 : 7, detail ? 9 : 5).scale(0.92, 1.08, 1);
  head.translate(0, 0.82, 0);
  addPart(head, 0, 0, skin);
  const hair = new THREE.SphereGeometry(0.1, detail ? 12 : 6, detail ? 7 : 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.translate(0, 0.845, -0.005);
  addPart(hair, 0, 0, [0.12, 0.09, 0.07]);
  for (const s of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.035, 0.03, detail ? 0.4 : 0.34, detail ? 7 : 5);
    arm.translate(s * 0.245, 0.66 - (detail ? 0.2 : 0.17), 0.0);
    addPart(arm, 0.4, 1, skin);
  }
  // 병합
  let total = 0;
  for (const p of parts) total += p.getAttribute('position').count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), mask = new Float32Array(total), arm = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    const n = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    col.set(p.getAttribute('color').array as Float32Array, o * 3);
    mask.set(p.getAttribute('aMask').array as Float32Array, o);
    arm.set(p.getAttribute('aArm').array as Float32Array, o);
    o += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  g.setAttribute('aArm', new THREE.BufferAttribute(arm, 1));
  return g;
}

function crowdMaterial(shared: SharedUniforms, cheer: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uCheer = cheer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aMask; attribute float aArm; attribute vec3 iTint; attribute float iSeed;
        uniform float uCheer; uniform float uTime; varying vec3 vTint; varying float vMask; varying float vY; varying float vSk;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTint = iTint; vMask = aMask; vY = position.y; vSk = fract(iSeed * 3.17);
        float sd = fract(iSeed * 13.7);
        float act = step(1.0 - uCheer * 0.9, sd);
        float ph = uTime * (4.5 + 3.0 * fract(iSeed * 7.1)) + iSeed * 20.0;
        float calm = sin(uTime * 0.7 + iSeed * 9.0) * 0.012;
        if (aArm > 0.5) {
          vec3 pv = transformed - vec3(0.0, 0.68, 0.0);
          float sg = sign(pv.x);
          float ang = act * (2.4 + 0.5 * sin(ph)) + 0.12 * sg * 0.0;
          float s = sin(ang), c = cos(ang);
          vec2 r = vec2(pv.x * c - sg * pv.y * s, sg * pv.x * s + pv.y * c);
          transformed = vec3(r.x, r.y + 0.66, pv.z);
        }
        transformed.y += act * 0.07 * abs(sin(ph)) + calm * 0.5;
        transformed.x += calm * (position.y);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vMask; varying float vY; varying float vSk;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), vTint, vMask);
        // 위쪽(어깨·머리)은 밝게, 아래 옷자락은 어둡게: 간이 차폐
        diffuseColor.rgb *= mix(0.7, 1.05, clamp((vY + 0.05) / 0.9, 0.0, 1.0));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78 + 0.5 * vSk, 0.85 + 0.25 * vSk, 0.8 + 0.3 * vSk), 1.0 - vMask);`);
    void NOISE_GLSL;
  };
  mat.customProgramCacheKey = () => 'crowd';
  return mat;
}

export class Crowd {
  readonly group = new THREE.Group();
  readonly cheer = { value: 0.0 };
  private meshes: THREE.InstancedMesh[] = [];
  private counts: number[] = [];
  private level = 1;
  excitement = 0; // 0..1 (시뮬레이션 상황에 따라)
  private smooth = 0;
  private burst = 0;

  constructor(shared: SharedUniforms, profile: { o: number; y: number }[]) {
    const rnd = mulberry32(2024);
    const mat = crowdMaterial(shared, this.cheer);
    const palette = [0xcdbf9f, 0xb8a47a, 0xa8895a, 0x9a6a30, 0x7a3326, 0x8a4a28, 0x55603f, 0x3f4d5c, 0x2f2a26, 0xb5a587, 0x8c6c40, 0x5e3226, 0xc2b690, 0x6a2620, 0x44382c];
    const tmp = new THREE.Color();
    // 방석 위(트레드) 목록
    const treads: { o0: number; o1: number; y: number; far: boolean }[] = [];
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1], b = profile[i];
      if (Math.abs(a.y - b.y) < 1e-6 && b.o - a.o > 0.6 && b.o - a.o < 1.2 && a.o >= 0.9) treads.push({ o0: a.o, o1: b.o, y: a.y, far: a.y > 8.5 });
    }
    const near: { m: THREE.Matrix4; tint: THREE.Color; seed: number }[] = [];
    const far: typeof near = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const t of treads) {
      const mid = (t.o0 + t.o1) / 2 + 0.12;
      // 둘레 길이를 근사해 균등 간격 배치
      const per = 2 * Math.PI * Math.sqrt(((15 + mid) ** 2 + (12 + mid) ** 2) / 2);
      const spacing = 0.72;
      const n = Math.floor(per / spacing);
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.2) continue; // 빈 자리
        const th = ((i + rnd() * 0.3) / n) * Math.PI * 2;
        // 출입구 위쪽(터널 위)은 사람을 비운다 + 계단 통로(보미토리아) 앞은 일부 비움
        const e = ellipseAt(th, mid);
        if (Math.abs(e.x) < 2.2 && Math.abs(e.z) > 13) { if (rnd() < 0.6) continue; }
        const yaw = Math.atan2(-e.nx, -e.nz);
        q.setFromEuler(new THREE.Euler(0, yaw + (rnd() - 0.5) * 0.5, 0));
        const s = 0.92 + rnd() * 0.2;
        m4.compose(new THREE.Vector3(e.x, t.y + 0.02, e.z), q, new THREE.Vector3(s, s * (0.95 + rnd() * 0.12), s));
        tmp.setHex(palette[Math.floor(rnd() * palette.length)]);
        // sRGB→선형
        tmp.convertSRGBToLinear();
        (t.far ? far : near).push({ m: m4.clone(), tint: tmp.clone(), seed: rnd() * 100 });
      }
    }
    const make = (list: typeof near, detail: boolean) => {
      const geo = personGeometry(detail);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const tints = new Float32Array(list.length * 3), seeds = new Float32Array(list.length);
      list.forEach((p, i) => {
        mesh.setMatrixAt(i, p.m);
        tints.set([p.tint.r, p.tint.g, p.tint.b], i * 3);
        seeds[i] = p.seed;
      });
      geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(tints, 3));
      geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.counts.push(list.length);
      this.group.add(mesh);
    };
    make(near, true);
    make(far, false);
  }

  get totalPeople() { return this.counts.reduce((a, b) => a + b, 0); }

  /** 0..1: 표시할 관중 비율 (그래픽 품질) */
  setDensity(level: number) {
    this.level = level;
    this.meshes.forEach((m, i) => { m.count = Math.floor(this.counts[i] * level); });
  }

  /** 환호 한 번 (큰 타격/승리 등) */
  cheerBurst(amount: number) {
    this.burst = Math.min(1, this.burst + amount);
  }

  update(dt: number) {
    const target = Math.min(1, this.excitement + this.burst);
    this.smooth += (target - this.smooth) * Math.min(1, dt * 2.5);
    this.burst = Math.max(0, this.burst - dt * 0.35);
    this.cheer.value = this.smooth;
  }
}
