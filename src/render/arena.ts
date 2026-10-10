import * as THREE from 'three';
import { ARENA } from '../simulation/arena';
import { createBannerMaterial, createSandMaterial, createStoneMaterial, type SharedUniforms } from './proceduralMaterials';
import { mulberry32 } from './rand';

/** 타원 위의 점 (오프셋 o 만큼 바깥) 과 바깥 법선 */
export function ellipseAt(theta: number, o: number) {
  const a = ARENA.a + o, b = ARENA.b + o;
  const x = a * Math.cos(theta), z = b * Math.sin(theta);
  const nx = (ARENA.b + o) * Math.cos(theta), nz = (ARENA.a + o) * Math.sin(theta);
  const l = Math.hypot(nx, nz);
  return { x, z, nx: nx / l, nz: nz / l };
}

interface ProfilePt { o: number; y: number }

/**
 * 프로파일(오프셋,높이)을 타원을 따라 스윕해 면을 만든다. uv.u = 호 길이(m), uv.v = 프로파일 누적 길이(m).
 * skip(theta) 가 true 인 구간은 건너뛴다 (출입구).
 */
function sweepProfile(profile: ProfilePt[], segs: number, opts: { flip?: boolean; skip?: (th: number) => boolean; arcOffset?: number; vBase?: (pt: ProfilePt, i: number) => number } = {}): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], nor: number[] = [];
  // 호 길이 누적 (기준 타원 o=0)
  const thetas: number[] = [];
  for (let i = 0; i <= segs; i++) thetas.push((i / segs) * Math.PI * 2);
  const arc: number[] = [0];
  for (let i = 1; i <= segs; i++) {
    const p0 = ellipseAt(thetas[i - 1], 0), p1 = ellipseAt(thetas[i], 0);
    arc.push(arc[i - 1] + Math.hypot(p1.x - p0.x, p1.z - p0.z));
  }
  const vAcc: number[] = [0];
  for (let k = 1; k < profile.length; k++) vAcc.push(vAcc[k - 1] + Math.hypot(profile[k].o - profile[k - 1].o, profile[k].y - profile[k - 1].y));
  for (let i = 0; i < segs; i++) {
    const th0 = thetas[i], th1 = thetas[i + 1];
    if (opts.skip && opts.skip((th0 + th1) / 2)) continue;
    const base = pos.length / 3;
    for (const [th, ai] of [[th0, i], [th1, i + 1]] as [number, number][]) {
      for (let k = 0; k < profile.length; k++) {
        const e = ellipseAt(th, profile[k].o);
        pos.push(e.x, profile[k].y, e.z);
        uv.push(arc[ai] + (opts.arcOffset ?? 0), opts.vBase ? opts.vBase(profile[k], k) : (profile[k].y > 0 && profile.length > 0 ? vAcc[k] + profile[0].y : vAcc[k]));
        nor.push(0, 1, 0);
      }
    }
    const P = profile.length;
    for (let k = 0; k < P - 1; k++) {
      const a = base + k, b = base + k + 1, c = base + P + k, d = base + P + k + 1;
      if (opts.flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface GateRig {
  grille: THREE.Group;
  baseY: number;
  openY: number;
  progress: number; // 0 닫힘, 1 열림
  target: number;
  speed: number;
  torchLights: THREE.PointLight[];
  flames: THREE.Mesh[];
  side: 'player' | 'lion';
  sign: number;
}

export class ArenaBuilder {
  readonly group = new THREE.Group();
  readonly shared: SharedUniforms = { time: { value: 0 } };
  readonly gates: Record<'player' | 'lion', GateRig> = {} as any;
  readonly banners: THREE.Mesh[] = [];
  readonly torchLights: THREE.PointLight[] = [];
  readonly sunShafts = new THREE.Group();
  readonly flames: THREE.Mesh[] = [];
  readonly stoneMat: THREE.MeshStandardMaterial;
  readonly darkStoneMat: THREE.MeshStandardMaterial;
  readonly vaultMat: THREE.MeshStandardMaterial;
  readonly podiumMat: THREE.MeshStandardMaterial;
  readonly seatMat: THREE.MeshStandardMaterial;
  readonly sandMat: THREE.MeshStandardMaterial;
  readonly ironMat: THREE.MeshStandardMaterial;
  readonly woodMat: THREE.MeshStandardMaterial;
  readonly pillars: THREE.Object3D[] = [];

  constructor() {
    this.stoneMat = createStoneMaterial({ tint: 0xd8c4a0, blockW: 1.3, blockH: 0.55, grime: 1.0 });
    this.darkStoneMat = createStoneMaterial({ tint: 0xa8957a, blockW: 1.1, blockH: 0.48, grime: 1.5, groundStain: 0.3 });
    this.vaultMat = createStoneMaterial({ tint: 0xa8957a, blockW: 1.1, blockH: 0.48, grime: 1.5, groundStain: 0.3 });
    this.vaultMat.side = THREE.DoubleSide;
    this.podiumMat = createStoneMaterial({ tint: 0xcdb892, blockW: 1.5, blockH: 0.6, grime: 1.3, bump: 1.3, groundStain: 1.6 });
    this.seatMat = createStoneMaterial({ tint: 0xe2d2ae, blockW: 2.6, blockH: 0.45, grime: 0.9, bump: 0.8, groundStain: 0.0 });
    this.sandMat = createSandMaterial(this.shared, { a: ARENA.a, b: ARENA.b });
    this.ironMat = new THREE.MeshStandardMaterial({ color: 0x2c2d2f, roughness: 0.62, metalness: 0.85 });
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.85, metalness: 0 });
    this.build();
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  private gateSkip = (th: number) => {
    // 출입구(남 -z: θ=-π/2, 북 +z: θ=π/2) 근처의 열린 구간
    const d1 = Math.abs(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)));
    const d2 = Math.abs(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2)));
    const half = (ARENA.gateHalfWidth + 0.05) / ARENA.a;
    return d1 < half || d2 < half;
  };

  private build() {
    this.buildFloor();
    this.buildPodium();
    this.buildStands();
    this.buildArcade();
    this.buildGates();
    this.buildPillars();
    this.buildDebris();
    this.buildBanners();
    this.buildSky();
  }

  // ── 바닥 ──
  private buildFloor() {
    const g = new THREE.CircleGeometry(1, 128);
    g.rotateX(-Math.PI / 2);
    const m = this.add(g, this.sandMat, false, true);
    m.scale.set(ARENA.a + 0.4, 1, ARENA.b + 0.4);
    m.name = 'sandFloor';
    // 문 앞 통로 바닥(돌판)
    for (const s of [-1, 1]) {
      const f = new THREE.PlaneGeometry(4.2, 9);
      f.rotateX(-Math.PI / 2);
      const uv = f.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4.2, uv.getY(i) * 9);
      const t = this.add(f, this.darkStoneMat, false, true);
      t.position.set(0, 0.01, s * (ARENA.b + 4.2));
    }
  }

  // ── 포디움 벽 (출입구 개구부 포함) ──
  private buildPodium() {
    const segs = 360;
    const H = 3.9;
    // 벽 정면 (안쪽을 향함)
    const front = sweepProfile([{ o: 0, y: 0 }, { o: 0, y: H }], segs, { flip: true, skip: this.gateSkip });
    this.add(front, this.podiumMat);
    // 상단 돌림띠(코니스)
    const cornice = sweepProfile([
      { o: 0, y: H - 0.35 }, { o: -0.1, y: H - 0.35 }, { o: -0.1, y: H - 0.12 }, { o: -0.02, y: H - 0.12 }, { o: -0.02, y: H }, { o: 0.9, y: H },
    ], segs, { flip: true });
    cornice.computeVertexNormals();
    this.add(cornice, this.stoneMat);
    // 출입구 상부 (아치 위 벽): 아치 곡선 위로만
    for (const sign of [-1, 1]) {
      const R = ARENA.gateHalfWidth;
      const straight = 2.0;
      const pts: THREE.Vector3[] = [];
      const n = 40;
      const zBase = sign * ARENA.b;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const x = -R + (2 * R * i) / n;
        const archY = straight + Math.sqrt(Math.max(0, R * R - x * x));
        const z = sign * (ARENA.b * Math.sqrt(Math.max(0, 1 - (x * x) / (ARENA.a * ARENA.a))));
        pos.push(x, archY, z, x, H, z);
        uv.push(x + 50, archY, x + 50, H);
        pts.push(new THREE.Vector3(x, archY, z));
        if (i < n) {
          const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
          if (sign < 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
        }
      }
      void zBase;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.add(g, this.podiumMat);
      // 아치 테두리 (쐐기돌 느낌의 굵은 링)
      const ringPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI;
        ringPts.push(new THREE.Vector3(Math.cos(a) * (R + 0.05), straight + Math.sin(a) * (R + 0.05), sign * (ARENA.b - 0.05) * 1.0));
      }
      const curve = new THREE.CatmullRomCurve3(ringPts);
      const tube = new THREE.TubeGeometry(curve, 40, 0.16, 8, false);
      this.add(tube, this.stoneMat);
      // 개구부 옆 기둥(문설주)
      for (const sx of [-1, 1]) {
        const jamb = new THREE.BoxGeometry(0.34, straight, 0.4);
        const m = this.add(jamb, this.stoneMat);
        m.position.set(sx * (R + 0.12), straight / 2, sign * (ARENA.b - 0.1));
        const uvA = jamb.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 0.4, uvA.getY(i) * 2);
      }
    }
    // 장식용 작은 문(닫힘): 벽에 박힌 나무 문과 철제 띠
    const smallDoors = [0.6, 2.5, 3.8, 5.7];
    for (const th of smallDoors) {
      const p = ellipseAt(th, 0.0);
      const doorW = 1.5, doorH = 2.3;
      const mk = (w: number, h: number, depth: number, mat: THREE.Material) => {
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0);
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 });
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = m.receiveShadow = true;
        return m;
      };
      const frame = mk(doorW + 0.5, doorH + 0.25, 0.1, this.darkStoneMat);
      frame.position.set(0, -doorH / 2, 0.0);
      const door = mk(doorW, doorH, 0.14, this.woodMat);
      door.position.set(0, -doorH / 2, 0.06);
      g.add(frame, door);
      for (const y of [-0.7, 0.1, 0.8]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.09, 0.05), this.ironMat);
        strap.position.set(0, y, 0.22);
        g.add(strap);
      }
      g.position.set(p.x - p.nx * 0.02, doorH / 2, p.z - p.nz * 0.02);
      g.lookAt(g.position.x - p.nx, g.position.y, g.position.z - p.nz);
      this.group.add(g);
    }
  }

  // ── 관중석 ──
  private buildStands() {
    const segs = 240;
    const H = 3.9;
    const prof: ProfilePt[] = [{ o: 0, y: H }, { o: 0.9, y: H }];
    let o = 0.9, y = H;
    for (let k = 0; k < 10; k++) {
      y += 0.42; prof.push({ o, y });
      o += 0.9; prof.push({ o, y });
    }
    // 하단 관중석 벽(프라이킨티오)
    prof.push({ o, y: y + 2.1 });
    const wallTopY = y + 2.1;
    const lowerEnd = prof.length;
    o += 1.7; prof.push({ o, y: wallTopY });
    for (let k = 0; k < 8; k++) {
      wallTopY; y = prof[prof.length - 1].y + 0.46; prof.push({ o: prof[prof.length - 1].o, y });
      o += 0.9; prof.push({ o, y });
    }
    const top = prof[prof.length - 1];
    prof.push({ o: top.o, y: top.y + 6.2 });
    prof.push({ o: top.o + 1.8, y: top.y + 6.2 });
    void lowerEnd;
    const g = sweepProfile(prof, segs, { flip: true });
    this.add(g, this.seatMat);
    this.standProfile = prof;
    // 환기구(보미토리아): 하단 관중석 벽 앞면의 어두운 아치
    const vom = new THREE.Shape();
    const w = 0.85, hs = 1.25, r = w;
    vom.moveTo(-w, 0); vom.lineTo(-w, hs); vom.absarc(0, hs, r, Math.PI, 0, true); vom.lineTo(w, 0); vom.lineTo(-w, 0);
    const vg = new THREE.ShapeGeometry(vom, 10);
    const vm = new THREE.MeshBasicMaterial({ color: 0x120d09 });
    const count = 28;
    const inst = new THREE.InstancedMesh(vg, vm, count);
    const m4 = new THREE.Matrix4();
    const wallO = prof[22]?.o ?? 9.9;
    void wallO;
    const wallPt = prof.find((p, i) => i > 0 && Math.abs(p.o - prof[i - 1].o) < 1e-6 && p.y - prof[i - 1].y > 1.5 && p.o > 5)!;
    const wallBase = prof[prof.indexOf(wallPt) - 1];
    for (let i = 0; i < count; i++) {
      const th = (i + 0.5) / count * Math.PI * 2;
      const e = ellipseAt(th, wallPt.o - 0.03);
      m4.lookAt(new THREE.Vector3(e.x, 0, e.z), new THREE.Vector3(e.x - e.nx, 0, e.z - e.nz), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m4);
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(e.x, wallBase.y + 0.0, e.z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, mm);
    }
    inst.castShadow = false;
    this.group.add(inst);
  }
  standProfile: ProfilePt[] = [];

  // ── 상층 열주 회랑 + 처마 ──
  private buildArcade() {
    const prof = this.standProfile;
    const top = prof[prof.length - 3];
    const baseY = top.y;
    const o = top.o + 0.5;
    const rnd = mulberry32(5);
    // 기둥: 로프트 프로파일(받침-몸통-주두)
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.001, 0), new THREE.Vector2(0.4, 0), new THREE.Vector2(0.4, 0.18), new THREE.Vector2(0.3, 0.26),
      new THREE.Vector2(0.285, 0.5), new THREE.Vector2(0.3, 2.2), new THREE.Vector2(0.27, 4.2), new THREE.Vector2(0.3, 4.3),
      new THREE.Vector2(0.42, 4.42), new THREE.Vector2(0.52, 4.62), new THREE.Vector2(0.52, 4.78), new THREE.Vector2(0.001, 4.78),
    ];
    const colGeo = new THREE.LatheGeometry(pts, 14);
    const colUv = colGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < colUv.count; i++) colUv.setXY(i, colUv.getX(i) * 1.9, colUv.getY(i) * 4.78);
    const n = 64;
    const cols = new THREE.InstancedMesh(colGeo, this.stoneMat, n);
    cols.castShadow = true;
    cols.receiveShadow = true;
    const archShape = new THREE.Shape();
    const bay = 3.2, aw = bay - 1.1;
    archShape.moveTo(-aw / 2 - 0.55, 0); archShape.lineTo(-aw / 2 - 0.55, 1.35); archShape.lineTo(aw / 2 + 0.55, 1.35); archShape.lineTo(aw / 2 + 0.55, 0); archShape.lineTo(-aw / 2 - 0.55, 0);
    const hole = new THREE.Path();
    hole.moveTo(-aw / 2, 0); hole.lineTo(-aw / 2, 0.55); hole.absarc(0, 0.55, aw / 2, Math.PI, 0, true); hole.lineTo(aw / 2, 0); hole.lineTo(-aw / 2, 0);
    archShape.holes.push(hole);
    const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.7, bevelEnabled: false });
    const archUv = archGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < archUv.count; i++) archUv.setXY(i, archUv.getX(i), archUv.getY(i));
    const arches = new THREE.InstancedMesh(archGeo, this.stoneMat, n);
    arches.castShadow = true;
    arches.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const e = ellipseAt(th, o);
      const look = new THREE.Matrix4().lookAt(new THREE.Vector3(e.x, 0, e.z), new THREE.Vector3(e.x - e.nx, 0, e.z - e.nz), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      cols.setMatrixAt(i, m4.compose(new THREE.Vector3(e.x, baseY, e.z), q, new THREE.Vector3(1, 1, 1)));
      const th2 = ((i + 0.5) / n) * Math.PI * 2;
      const e2 = ellipseAt(th2, o);
      const look2 = new THREE.Matrix4().lookAt(new THREE.Vector3(e2.x, 0, e2.z), new THREE.Vector3(e2.x - e2.nx, 0, e2.z - e2.nz), new THREE.Vector3(0, 1, 0));
      const q2 = new THREE.Quaternion().setFromRotationMatrix(look2);
      // 아치는 기둥 사이, 기둥 높이(4.78) 근처에서 시작
      const sx = (2 * Math.PI * Math.hypot(ARENA.a + o, ARENA.b + o) / n) / bay;
      arches.setMatrixAt(i, m4.compose(new THREE.Vector3(e2.x - e2.nz * 0, baseY + 3.4, e2.z), q2, new THREE.Vector3(sx, 1, 1)));
    }
    this.group.add(cols, arches);
    void rnd;
    // 상부 처마 띠 + 안쪽 어두운 벽 (창문)
    const cornice = sweepProfile([
      { o: o - 0.8, y: baseY + 5.2 }, { o: o + 0.9, y: baseY + 5.2 }, { o: o + 0.9, y: baseY + 5.6 }, { o: o - 0.9, y: baseY + 5.6 }, { o: o - 0.9, y: baseY + 5.2 },
    ], 200, { flip: false });
    this.add(cornice, this.stoneMat);
    // 벽 창문 (어두운 사각형)
    const winGeo = new THREE.PlaneGeometry(1.2, 2.2);
    const winMat = new THREE.MeshBasicMaterial({ color: 0x0e0a07 });
    const win = new THREE.InstancedMesh(winGeo, winMat, n);
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * Math.PI * 2;
      const e = ellipseAt(th, o + 1.2);
      const look = new THREE.Matrix4().lookAt(new THREE.Vector3(e.x, 0, e.z), new THREE.Vector3(e.x - e.nx, 0, e.z - e.nz), new THREE.Vector3(0, 1, 0));
      win.setMatrixAt(i, m4.compose(new THREE.Vector3(e.x, baseY + 2.4, e.z), new THREE.Quaternion().setFromRotationMatrix(look), new THREE.Vector3(1, 1, 1)));
    }
    this.group.add(win);
    this.arcadeTopY = baseY + 5.6;
    this.arcadeO = o;
    this.buildVelarium(baseY + 5.2, o);
  }
  arcadeTopY = 20;
  arcadeO = 18;

  // ── 차양막(벨라리움): 햇빛과 그늘의 대비를 만든다 ──
  private buildVelarium(y: number, o: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9c7a2, roughness: 0.95, side: THREE.DoubleSide, transparent: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.shared.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uTime * 0.8 + position.x * 0.35 + position.z * 0.3) * 0.12;');
    };
    // 4개의 사다리꼴 천 조각이 위쪽 가장자리에서 중앙을 향해 처진다
    const sails = [
      { th: 0.35, span: 0.55 }, { th: 1.45, span: 0.5 }, { th: 3.4, span: 0.55 }, { th: 4.6, span: 0.5 },
    ];
    for (const s of sails) {
      const geo = new THREE.BufferGeometry();
      const pos: number[] = [], idx: number[] = [];
      const n = 16, m = 6;
      for (let i = 0; i <= n; i++) {
        const th = s.th - s.span / 2 + (i / n) * s.span;
        for (let j = 0; j <= m; j++) {
          const t = j / m;
          const e = ellipseAt(th, o - t * (o + 0.5 - 7.5) * 0.0 - t * 11);
          const sag = Math.sin(Math.PI * i / n) * 0.35 * t;
          pos.push(e.x, y - t * 4.4 - sag, e.z);
        }
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        const a = i * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m4 = this.add(geo, mat, true, true);
      m4.name = 'sail';
    }
  }

  // ── 출입구 + 터널 + 창살 + 횃불 ──
  private buildGates() {
    for (const side of ['player', 'lion'] as const) {
      const sign = side === 'player' ? -1 : 1;
      const R = ARENA.gateHalfWidth, straight = 2.0, len = 8.5;
      const g = new THREE.Group();
      g.name = `gate_${side}`;
      // 터널 내부 벽/바닥/천장
      const walls = new THREE.Group();
      const wallGeo = new THREE.PlaneGeometry(len, straight);
      const uvw = wallGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uvw.count; i++) uvw.setXY(i, uvw.getX(i) * len, uvw.getY(i) * straight);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wallGeo, this.darkStoneMat);
        w.rotation.y = -sx * Math.PI / 2;
        w.position.set(sx * R, straight / 2, sign * (ARENA.b + len / 2));
        w.receiveShadow = true; w.castShadow = true;
        walls.add(w);
      }
      const vault = new THREE.CylinderGeometry(R, R, len, 28, 1, true, -Math.PI / 2, Math.PI);
      const vuv = vault.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < vuv.count; i++) vuv.setXY(i, vuv.getX(i) * Math.PI * R, vuv.getY(i) * len);
      vault.rotateX(-Math.PI / 2);
      const v = new THREE.Mesh(vault, this.vaultMat);
      v.position.set(0, straight, sign * (ARENA.b + len / 2));
      v.receiveShadow = true; v.castShadow = true;
      walls.add(v);
      // 터널 바닥
      const floorGeo = new THREE.PlaneGeometry(R * 2, len);
      const fu = floorGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) * R * 2, fu.getY(i) * len);
      const fl = new THREE.Mesh(floorGeo, this.darkStoneMat);
      fl.rotation.x = -Math.PI / 2;
      fl.position.set(0, 0.012, sign * (ARENA.b + len / 2));
      fl.receiveShadow = true;
      walls.add(fl);
      // 터널 끝 (어둠)
      const endShape = new THREE.Shape();
      endShape.moveTo(-R, 0); endShape.lineTo(-R, straight); endShape.absarc(0, straight, R, Math.PI, 0, true); endShape.lineTo(R, 0); endShape.lineTo(-R, 0);
      const end = new THREE.Mesh(new THREE.ShapeGeometry(endShape, 12), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.DoubleSide }));
      end.position.set(0, 0, sign * (ARENA.b + len));
      walls.add(end);
      g.add(walls);

      // 창살 (철봉 인스턴싱)
      const grille = new THREE.Group();
      const barGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
      const nb = 21;
      const bars = new THREE.InstancedMesh(barGeo, this.ironMat, nb);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < nb; i++) {
        const x = -R + 0.08 + ((2 * R - 0.16) * i) / (nb - 1);
        const hh = straight + Math.sqrt(Math.max(0.0001, R * R - x * x)) - 0.02;
        m4.compose(new THREE.Vector3(x, hh / 2, 0), new THREE.Quaternion(), new THREE.Vector3(1, hh, 1));
        bars.setMatrixAt(i, m4);
      }
      bars.castShadow = true;
      grille.add(bars);
      for (const y of [0.35, 1.2, 2.05, 2.8, 3.35]) {
        const half = Math.sqrt(Math.max(0, R * R - Math.max(0, y - straight) ** 2));
        const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.07, 0.07), this.ironMat);
        rail.position.set(0, y, 0.03);
        rail.castShadow = true;
        grille.add(rail);
      }
      for (let i = 0; i < nb; i += 2) {
        const x = -R + 0.08 + ((2 * R - 0.16) * i) / (nb - 1);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), this.ironMat);
        const hh = straight + Math.sqrt(Math.max(0.0001, R * R - x * x)) - 0.02;
        spike.position.set(x, hh + 0.04, 0);
        grille.add(spike);
      }
      grille.position.set(0, 0, sign * (ARENA.b + 0.12));
      g.add(grille);

      // 횃불
      const lights: THREE.PointLight[] = [];
      const flames: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const torch = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 8), this.woodMat);
        stick.position.y = 0.3;
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.14, 10), this.ironMat);
        cup.position.y = 0.64;
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa24a, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.scale.set(0.8, 1.7, 0.8);
        flame.position.y = 0.86;
        torch.add(stick, cup, flame);
        torch.position.set(sx * (R - 0.12), 1.55, sign * (ARENA.b + 2.6));
        torch.rotation.z = -sx * 0.18;
        g.add(torch);
        flames.push(flame);
        const L = new THREE.PointLight(0xff8a3a, 9, 9, 2);
        L.position.set(sx * (R - 0.45), 2.45, sign * (ARENA.b + 2.6));
        L.castShadow = false;
        g.add(L);
        lights.push(L);
      }
      this.group.add(g);
      this.torchLights.push(...lights);
      this.flames.push(...flames);
      this.gates[side] = {
        grille, baseY: 0, openY: 3.7, progress: side === 'player' ? 1 : 0, target: side === 'player' ? 1 : 0, speed: 0.4,
        torchLights: lights, flames, side, sign,
      };
      grille.position.y = this.gates[side].progress * 3.7;
    }
  }

  // ── 부서진 기둥 토막 (충돌체와 일치) ──
  private buildPillars() {
    const rnd = mulberry32(11);
    for (const p of ARENA.pillars) {
      const g = new THREE.Group();
      const drums = Math.max(1, Math.round(p.h / 0.7));
      for (let i = 0; i < drums; i++) {
        const dh = p.h / drums;
        const geo = new THREE.CylinderGeometry(p.r * (1 - 0.04 * (i + 1)), p.r * (1 - 0.04 * i), dh, 24, 3);
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.PI * 2 * p.r, uv.getY(k) * dh + i * dh);
        const posA = geo.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < posA.count; k++) {
          const x = posA.getX(k), y = posA.getY(k), z = posA.getZ(k);
          const j = (rnd() - 0.5) * 0.04;
          posA.setXYZ(k, x + j, y + (i === drums - 1 && y > 0 ? (rnd() - 0.4) * 0.12 : 0), z + j);
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, this.stoneMat);
        m.position.y = i * dh + dh / 2;
        m.rotation.y = rnd() * 6;
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      }
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.25, p.r * 1.35, 0.18, 24), this.darkStoneMat);
      plinth.position.y = 0.09;
      plinth.castShadow = plinth.receiveShadow = true;
      g.add(plinth);
      g.position.set(p.x, 0, p.z);
      this.group.add(g);
      this.pillars.push(g);
    }
  }

  // ── 바닥의 돌 조각 ──
  private buildDebris() {
    const rnd = mulberry32(77);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = createStoneMaterial({ tint: 0xb9a78a, blockW: 8, blockH: 8, grime: 1.2, bump: 1.6 });
    const n = 70;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    while (placed < n) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.97;
      const x = Math.cos(a) * ARENA.a * r, z = Math.sin(a) * ARENA.b * r;
      if (Math.hypot(x, z) < 5 && rnd() < 0.85) continue; // 중앙은 비운다 (전투 가독성)
      if (Math.abs(x) < 3 && Math.abs(z) > ARENA.b - 5) continue;
      const s = 0.05 + rnd() * rnd() * 0.22;
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      m4.compose(new THREE.Vector3(x, s * 0.35, z), q, new THREE.Vector3(s * (0.8 + rnd() * 0.6), s * 0.6, s * (0.8 + rnd() * 0.6)));
      inst.setMatrixAt(placed++, m4);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);
    // 쓰러진 기둥 몸통
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 3.4, 20), this.stoneMat);
    const cu = col.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 3.2, cu.getY(i) * 3.4);
    col.rotation.z = Math.PI / 2;
    col.rotation.y = 0.5;
    col.position.set(-11.8, 0.5, -1.6);
    col.castShadow = col.receiveShadow = true;
    this.group.add(col);
  }

  // ── 깃발 ──
  private buildBanners() {
    const defs = [
      { field: 0x7a1c16, trim: 0xc9a24a }, { field: 0x2e2a26, trim: 0xb88a3c }, { field: 0x7a1c16, trim: 0xb88a3c },
    ];
    const mats = defs.map((d) => createBannerMaterial(this.shared, d));
    const geo = new THREE.PlaneGeometry(1.0, 3.2, 10, 24);
    const prof = this.standProfile;
    const wallPt = prof.find((p, i) => i > 0 && Math.abs(p.o - prof[i - 1].o) < 1e-6 && p.y - prof[i - 1].y > 1.5 && p.o > 5)!;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * Math.PI * 2 + 0.08;
      const e = ellipseAt(th, wallPt.o - 0.1);
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.position.set(e.x, wallPt.y - 0.2, e.z);
      m.lookAt(e.x - e.nx, wallPt.y - 0.2, e.z - e.nz);
      // 깃대를 따라 위쪽이 고정되도록 피벗 이동
      m.castShadow = true;
      this.group.add(m);
      this.banners.push(m);
    }
    // 아케이드 상단 긴 깃발
    const longGeo = new THREE.PlaneGeometry(1.4, 5.0, 10, 24);
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * Math.PI * 2 + 0.3;
      const e = ellipseAt(th, this.arcadeO - 0.4);
      const m = new THREE.Mesh(longGeo, mats[(i + 1) % mats.length]);
      m.position.set(e.x, this.arcadeTopY - 1.0, e.z);
      m.lookAt(e.x - e.nx, this.arcadeTopY - 1.0, e.z - e.nz);
      this.group.add(m);
      this.banners.push(m);
    }
    // 포디움 위 철제 깃대
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * Math.PI * 2 + 0.08;
      const e = ellipseAt(th, wallPt.o - 0.1);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), this.ironMat);
      pole.position.set(e.x, wallPt.y + 1.4, e.z);
      pole.rotation.z = Math.PI / 2;
      void pole;
    }
  }

  // ── 하늘 ──
  private buildSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.5, 0.6, 0.4) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 horizon = vec3(0.86, 0.80, 0.66);
          vec3 zenith = vec3(0.30, 0.50, 0.82);
          vec3 c = mix(horizon, zenith, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
          c += vec3(1.0, 0.85, 0.55) * pow(s, 24.0) * 0.45 + vec3(1.0, 0.95, 0.8) * pow(s, 700.0) * 3.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.name = 'sky';
    sky.renderOrder = -10;
    this.group.add(sky);
    this.skyMat = mat;
  }
  skyMat!: THREE.ShaderMaterial;

  /** 문 창살 목표 상태 설정 (open=true 이면 올라간다) */
  setGate(side: 'player' | 'lion', open: boolean, speed = 0.45) {
    const g = this.gates[side];
    g.target = open ? 1 : 0;
    g.speed = speed;
  }
  gateProgress(side: 'player' | 'lion') { return this.gates[side].progress; }
  snapGate(side: 'player' | 'lion', open: boolean) {
    const g = this.gates[side];
    g.progress = g.target = open ? 1 : 0;
    g.grille.position.y = g.progress * g.openY;
  }

  update(dt: number, time: number) {
    this.shared.time.value = time;
    for (const side of ['player', 'lion'] as const) {
      const g = this.gates[side];
      if (g.progress !== g.target) {
        const d = g.target - g.progress;
        g.progress += Math.sign(d) * Math.min(Math.abs(d), g.speed * dt);
        g.grille.position.y = g.progress * g.openY;
      }
    }
    // 횃불 불꽃 일렁임
    this.torchLights.forEach((l, i) => {
      l.intensity = 8.5 + Math.sin(time * 11 + i * 3.1) * 1.3 + Math.sin(time * 23 + i) * 0.8;
    });
    this.flames.forEach((f, i) => {
      f.scale.set(0.8 + Math.sin(time * 17 + i) * 0.1, 1.7 + Math.sin(time * 13 + i * 2.0) * 0.25, 0.8);
    });
  }
}
