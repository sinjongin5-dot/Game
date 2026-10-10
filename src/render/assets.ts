import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface AssetManifestEntry {
  key: string;
  url: string;
  kind: 'gltf' | 'texture';
  label: string;
  /** 응답 헤더가 오기 전 진행률 계산에 쓰는 예상 크기(바이트) */
  size: number;
}

export interface LoadedAssets {
  gltf: Record<string, GLTF>;
  textures: Record<string, THREE.Texture>;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  fraction: number;
  current: string;
  failed: { key: string; label: string; reason: string }[];
}

const BASE = import.meta.env.BASE_URL ?? '/';

export const MANIFEST: AssetManifestEntry[] = [
  { key: 'lion', url: `${BASE}assets/models/lion.glb`, kind: 'gltf', label: '숫사자 모델', size: 2120000 },
  { key: 'gladiator', url: `${BASE}assets/models/gladiator.glb`, kind: 'gltf', label: '검투사 모델', size: 1380000 },
  { key: 'shield', url: `${BASE}assets/textures/shield_face.png`, kind: 'texture', label: '방패 문양', size: 250000 },
];

/** 실제 바이트 수 기반 진행률. 실패 시 원인을 기록하고 계속 시도한다. */
export async function loadAssets(
  onProgress: (p: LoadProgress) => void,
  manifest: AssetManifestEntry[] = MANIFEST,
): Promise<{ assets: LoadedAssets; progress: LoadProgress }> {
  const assets: LoadedAssets = { gltf: {}, textures: {} };
  const per: Record<string, { loaded: number; total: number }> = {};
  const progress: LoadProgress = { loaded: 0, total: 0, fraction: 0, current: '', failed: [] };
  const emit = () => {
    let l = 0, t = 0;
    for (const v of Object.values(per)) { l += v.loaded; t += v.total || v.loaded; }
    progress.loaded = l;
    progress.total = t;
    progress.fraction = t > 0 ? Math.min(1, l / t) : 0;
    onProgress({ ...progress, failed: [...progress.failed] });
  };

  for (const m of manifest) per[m.key] = { loaded: 0, total: m.size };
  emit();

  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader();

  await Promise.all(manifest.map(async (m) => {
    progress.current = m.label;
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length') ?? per[m.key].total ?? 0);
      if (total) per[m.key].total = total;
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        per[m.key].loaded = got;
        if (!per[m.key].total) per[m.key].total = got;
        emit();
      }
      per[m.key].total = got;
      const blob = new Blob(chunks as BlobPart[]);
      if (m.kind === 'gltf') {
        const buf = await blob.arrayBuffer();
        assets.gltf[m.key] = await new Promise<GLTF>((ok, bad) => gl.parse(buf, `${BASE}assets/models/`, ok, bad));
      } else {
        const url = URL.createObjectURL(blob);
        assets.textures[m.key] = await new Promise<THREE.Texture>((ok, bad) => tl.load(url, ok, undefined, bad));
        URL.revokeObjectURL(url);
        assets.textures[m.key].colorSpace = THREE.SRGBColorSpace;
      }
      emit();
    } catch (e) {
      progress.failed.push({ key: m.key, label: m.label, reason: e instanceof Error ? e.message : String(e) });
      emit();
    }
  }));
  progress.current = '';
  emit();
  return { assets, progress };
}
