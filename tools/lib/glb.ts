import { Document, NodeIO, type Node as GNode, type Material as GMat } from '@gltf-transform/core';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import type { BoneDef } from '../../src/rig/types';

export interface MatSpec {
  color: [number, number, number, number?]; // 선형 RGB
  rough: number;
  metal: number;
  emissive?: [number, number, number];
  doubleSided?: boolean;
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  extras?: Record<string, unknown>;
}

export interface PartOut {
  name: string;
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  colors?: Float32Array; // rgba
  uvs?: Float32Array;
  joints?: Uint16Array; // x4
  weights?: Float32Array; // x4
  /** 본에 붙는 리지드 메시: 위치는 모델 공간, 저장 시 본 로컬로 변환 */
  rigidBone?: string;
  extras?: Record<string, unknown>;
}

/** 전체 가중치 배열(nBones) → 상위 4개 */
export function packWeights(w: Float32Array, nBones: number, outJ: Uint16Array, outW: Float32Array, o: number) {
  let b0 = -1, b1 = -1, b2 = -1, b3 = -1;
  const best = [0, 0, 0, 0];
  const bi = [0, 0, 0, 0];
  for (let i = 0; i < nBones; i++) {
    const v = w[i];
    if (v <= best[3]) continue;
    let k = 3;
    while (k > 0 && v > best[k - 1]) k--;
    for (let m = 3; m > k; m--) { best[m] = best[m - 1]; bi[m] = bi[m - 1]; }
    best[k] = v; bi[k] = i;
  }
  void b0; void b1; void b2; void b3;
  const sum = best[0] + best[1] + best[2] + best[3] || 1;
  for (let k = 0; k < 4; k++) {
    outJ[o * 4 + k] = best[k] > 0 ? bi[k] : 0;
    outW[o * 4 + k] = best[k] / sum;
  }
}

export async function writeGlb(opts: {
  bones: BoneDef[];
  materials: Record<string, MatSpec>;
  parts: PartOut[];
  path: string;
  compress?: boolean;
  extras?: Record<string, unknown>;
}): Promise<{ bytes: number }> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');
  const boneNodes: GNode[] = [];
  const posOf = new Map<string, [number, number, number]>();
  for (const b of opts.bones) posOf.set(b.name, b.pos);
  for (const b of opts.bones) {
    const n = doc.createNode(b.name);
    const pp = b.parent ? posOf.get(b.parent)! : [0, 0, 0];
    n.setTranslation([b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]]);
    boneNodes.push(n);
  }
  opts.bones.forEach((b, i) => {
    if (b.parent) boneNodes[opts.bones.findIndex((x) => x.name === b.parent)].addChild(boneNodes[i]);
  });
  const rootNode = boneNodes[0];
  scene.addChild(rootNode);
  const ibm = new Float32Array(opts.bones.length * 16);
  opts.bones.forEach((b, i) => {
    // 이동만 있는 행렬의 역
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1];
    ibm.set(m, i * 16);
  });
  const skin = doc.createSkin('skin').setSkeleton(rootNode);
  boneNodes.forEach((n) => skin.addJoint(n));
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));

  const mats = new Map<string, GMat>();
  for (const [name, m] of Object.entries(opts.materials)) {
    const gm = doc
      .createMaterial(name)
      .setBaseColorFactor([m.color[0], m.color[1], m.color[2], m.color[3] ?? 1])
      .setRoughnessFactor(m.rough)
      .setMetallicFactor(m.metal)
      .setDoubleSided(!!m.doubleSided);
    if (m.emissive) gm.setEmissiveFactor(m.emissive);
    if (m.alphaMode) gm.setAlphaMode(m.alphaMode);
    if (m.extras) gm.setExtras(m.extras as any);
    mats.set(name, gm);
  }

  const acc = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', arr: any) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

  for (const p of opts.parts) {
    let positions = p.positions;
    if (p.rigidBone) {
      const bp = posOf.get(p.rigidBone)!;
      positions = new Float32Array(p.positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = p.positions[i] - bp[0];
        positions[i + 1] = p.positions[i + 1] - bp[1];
        positions[i + 2] = p.positions[i + 2] - bp[2];
      }
    }
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', acc('VEC3', positions))
      .setAttribute('NORMAL', acc('VEC3', p.normals))
      .setIndices(acc('SCALAR', p.indices))
      .setMaterial(mats.get(p.material)!);
    if (p.colors) prim.setAttribute('COLOR_0', acc('VEC4', p.colors));
    if (p.uvs) prim.setAttribute('TEXCOORD_0', acc('VEC2', p.uvs));
    if (p.joints && p.weights && !p.rigidBone) {
      prim.setAttribute('JOINTS_0', acc('VEC4', p.joints));
      prim.setAttribute('WEIGHTS_0', acc('VEC4', p.weights));
    }
    const mesh = doc.createMesh(p.name).addPrimitive(prim);
    if (p.extras) mesh.setExtras(p.extras as any);
    const node = doc.createNode(p.name).setMesh(mesh);
    if (p.rigidBone) {
      boneNodes[opts.bones.findIndex((b) => b.name === p.rigidBone)].addChild(node);
    } else {
      node.setSkin(skin);
      scene.addChild(node);
    }
    if (p.extras) node.setExtras(p.extras as any);
  }
  if (opts.extras) doc.getRoot().setExtras(opts.extras as any);

  const io = new NodeIO();
  let bytes: Uint8Array;
  if (opts.compress) {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    const io2 = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    bytes = await io2.writeBinary(doc);
  } else {
    bytes = await io.writeBinary(doc);
  }
  const fs = await import('node:fs');
  fs.mkdirSync(opts.path.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(opts.path, bytes);
  return { bytes: bytes.length };
}
