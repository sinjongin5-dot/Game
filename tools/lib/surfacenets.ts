import type { SD } from './sdf';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * Naive Surface Nets. bbox 범위를 셀 크기 h 로 나눠 SDF 의 0 등고면을 메싱한다.
 * 정점은 등고면 위로 투영(뉴턴 반복)해 계단 현상을 없애고, 노말은 SDF 기울기로 구한다.
 */
export function surfaceNets(
  sd: SD,
  bb: [number, number, number, number, number, number],
  h: number,
  opts: { project?: number } = {},
): MeshData {
  const nx = Math.ceil((bb[3] - bb[0]) / h), ny = Math.ceil((bb[4] - bb[1]) / h), nz = Math.ceil((bb[5] - bb[2]) / h);
  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  const vals = new Float32Array(sx * sy * sz);
  const idx = (i: number, j: number, k: number) => (k * sy + j) * sx + i;
  for (let k = 0; k < sz; k++) {
    const z = bb[2] + k * h;
    for (let j = 0; j < sy; j++) {
      const y = bb[1] + j * h;
      for (let i = 0; i < sx; i++) {
        vals[idx(i, j, k)] = sd(bb[0] + i * h, y, z);
      }
    }
  }
  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  const cidx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const pos: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  let count = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = vals[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (const [a, b] of edges) {
          const va = v[a], vb = v[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          ax += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          ay += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          az += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          n++;
        }
        cellIndex[cidx(i, j, k)] = count++;
        pos.push(bb[0] + (i + ax / n) * h, bb[1] + (j + ay / n) * h, bb[2] + (k + az / n) * h);
      }
    }
  }
  // 면 생성
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < sz; k++) {
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) {
        const v0 = vals[idx(i, j, k)] < 0;
        // x 방향 엣지
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz) {
          const v1 = vals[idx(i + 1, j, k)] < 0;
          if (v0 !== v1) {
            const a = cellIndex[cidx(i, j - 1, k - 1)], b = cellIndex[cidx(i, j, k - 1)];
            const c = cellIndex[cidx(i, j, k)], d = cellIndex[cidx(i, j - 1, k)];
            quad(a, b, c, d, v0);
          }
        }
        if (j < ny && i > 0 && k > 0 && i < nx && k < nz) {
          const v1 = vals[idx(i, j + 1, k)] < 0;
          if (v0 !== v1) {
            const a = cellIndex[cidx(i - 1, j, k - 1)], b = cellIndex[cidx(i - 1, j, k)];
            const c = cellIndex[cidx(i, j, k)], d = cellIndex[cidx(i, j, k - 1)];
            quad(a, b, c, d, v0);
          }
        }
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny) {
          const v1 = vals[idx(i, j, k + 1)] < 0;
          if (v0 !== v1) {
            const a = cellIndex[cidx(i - 1, j - 1, k)], b = cellIndex[cidx(i, j - 1, k)];
            const c = cellIndex[cidx(i, j, k)], d = cellIndex[cidx(i - 1, j, k)];
            quad(a, b, c, d, v0);
          }
        }
      }
    }
  }
  const positions = new Float32Array(pos);
  // 투영
  const iters = opts.project ?? 2;
  const e = h * 0.35;
  const normals = new Float32Array(positions.length);
  for (let vi = 0; vi < positions.length / 3; vi++) {
    let x = positions[vi * 3], y = positions[vi * 3 + 1], z = positions[vi * 3 + 2];
    for (let it = 0; it < iters; it++) {
      const f = sd(x, y, z);
      const gx = sd(x + e, y, z) - sd(x - e, y, z);
      const gy = sd(x, y + e, z) - sd(x, y - e, z);
      const gz = sd(x, y, z + e) - sd(x, y, z - e);
      const gl2 = gx * gx + gy * gy + gz * gz;
      if (gl2 < 1e-12) break;
      const s = (f * 2 * e) / gl2; // g = grad*2e => f / |grad|^2 * grad  = f*(g/2e)/(|g|^2/4e^2)... 
      // grad = g/(2e); step = f*grad/|grad|^2 = f*g*(2e)/|g|^2
      const k2 = f * 2 * e / gl2;
      void s;
      const nxp = x - gx * k2, nyp = y - gy * k2, nzp = z - gz * k2;
      // 셀 크기 이상 이동하지 않도록 제한
      const dx = nxp - x, dy = nyp - y, dz = nzp - z;
      const dl = Math.hypot(dx, dy, dz);
      const lim = h * 0.9;
      const sc = dl > lim ? lim / dl : 1;
      x += dx * sc; y += dy * sc; z += dz * sc;
    }
    positions[vi * 3] = x; positions[vi * 3 + 1] = y; positions[vi * 3 + 2] = z;
    const gx = sd(x + e, y, z) - sd(x - e, y, z);
    const gy = sd(x, y + e, z) - sd(x, y - e, z);
    const gz = sd(x, y, z + e) - sd(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    normals[vi * 3] = gx / gl; normals[vi * 3 + 1] = gy / gl; normals[vi * 3 + 2] = gz / gl;
  }
  // 면 방향을 정점 노말 기준으로 교정
  const idxArr = new Uint32Array(tris);
  for (let t = 0; t < idxArr.length; t += 3) {
    const a = idxArr[t] * 3, b = idxArr[t + 1] * 3, c = idxArr[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const wx = positions[c] - positions[a], wy = positions[c + 1] - positions[a + 1], wz = positions[c + 2] - positions[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const nx2 = normals[a] + normals[b] + normals[c], ny2 = normals[a + 1] + normals[b + 1] + normals[c + 1], nz2 = normals[a + 2] + normals[b + 2] + normals[c + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) {
      const tmp = idxArr[t + 1]; idxArr[t + 1] = idxArr[t + 2]; idxArr[t + 2] = tmp;
    }
  }
  return { positions, normals, indices: idxArr };
}
