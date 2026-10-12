import * as THREE from 'three';
import { injectHitFlash, LIGHTING } from './fx';
import { NOISE_GLSL } from './glsl';

export type MatKind = 'skin' | 'bronze' | 'iron' | 'steel' | 'leather' | 'cloth' | 'wood' | 'shield_face' | 'glass';

interface KindParams {
  scale: number; // 노이즈 주파수 (1/m)
  colorVar: number;
  roughVar: number;
  bump: number;
  rough: number;
  metal: number;
  weave?: number;
  patina?: number;
}

const PARAMS: Record<string, KindParams> = {
  skin: { scale: 55, colorVar: 0.12, roughVar: 0.15, bump: 0.0012, rough: 0.58, metal: 0 },
  bronze: { scale: 70, colorVar: 0.25, roughVar: 0.3, bump: 0.002, rough: 0.34, metal: 0.92, patina: 0.55 },
  iron: { scale: 60, colorVar: 0.3, roughVar: 0.35, bump: 0.003, rough: 0.5, metal: 0.85, patina: 0.7 },
  steel: { scale: 90, colorVar: 0.15, roughVar: 0.3, bump: 0.0008, rough: 0.38, metal: 0.9 },
  leather: { scale: 140, colorVar: 0.3, roughVar: 0.2, bump: 0.004, rough: 0.76, metal: 0 },
  cloth: { scale: 200, colorVar: 0.22, roughVar: 0.1, bump: 0.003, rough: 0.95, metal: 0, weave: 1 },
  wood: { scale: 120, colorVar: 0.3, roughVar: 0.2, bump: 0.002, rough: 0.72, metal: 0 },
  shield_face: { scale: 150, colorVar: 0.0, roughVar: 0.2, bump: 0.0015, rough: 0.7, metal: 0.05 },
  glass: { scale: 40, colorVar: 0.05, roughVar: 0.05, bump: 0, rough: 0.12, metal: 0 },
};

export function createCharMaterial(kind: string, src?: THREE.MeshStandardMaterial, opts: { vertexColors?: boolean; map?: THREE.Texture | null } = {}): THREE.MeshStandardMaterial {
  const p = PARAMS[kind] ?? PARAMS.leather;
  // 피부/가죽/금속은 MeshPhysicalMaterial: 땀/기름 광택(clearcoat)과 천의 결(sheen)을 쓴다
  const mat = new THREE.MeshPhysicalMaterial({
    color: src ? src.color.clone() : 0xffffff,
    roughness: p.rough,
    metalness: p.metal,
    vertexColors: opts.vertexColors ?? !!(src as any)?.vertexColors,
    map: opts.map ?? null,
  });
  if (kind === 'skin') { mat.clearcoat = 0.18; mat.clearcoatRoughness = 0.38; mat.sheen = 0.35; mat.sheenColor = new THREE.Color(0.95, 0.62, 0.5); mat.sheenRoughness = 0.55; }
  if (kind === 'leather') { mat.clearcoat = 0.06; mat.clearcoatRoughness = 0.5; }
  if (kind === 'cloth') { mat.sheen = 0.6; mat.sheenColor = new THREE.Color(0.9, 0.85, 0.8); mat.sheenRoughness = 0.7; }
  if (kind === 'bronze' || kind === 'steel') { mat.envMapIntensity = 1.35; mat.clearcoat = 0.1; mat.clearcoatRoughness = 0.25; }
  mat.name = kind;
  if (kind === 'glass') {
    mat.transparent = true;
    mat.opacity = 0.82;
    mat.envMapIntensity = 1.4;
  }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunV = LIGHTING.sunView;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; uniform vec3 uSunV;
        ${NOISE_GLSL}
        float heightFn(vec3 q){
          float h = fbm3(q * ${p.scale.toFixed(1)});
          ${p.weave ? 'h += 0.35 * (sin(q.x * 900.0) * sin(q.y * 900.0 + q.z * 300.0));' : ''}
          ${kind === 'leather' ? 'h += 0.5 * vnoise(q * 320.0);' : ''}
          ${kind === 'wood' ? 'h = 0.5 * sin((q.y + 0.4 * fbm3(q * 30.0)) * 260.0) + 0.5 * h;' : ''}
          return h;
        }
        vec3 perturbN(vec3 sp, vec3 sn, vec2 dH, float fd){
          vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
          vec3 R1 = cross(sy, sn); vec3 R2 = cross(sn, sx);
          float det = dot(sx, R1) * fd;
          vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
          return normalize(abs(det) * sn - g);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dn = fbm3(vRest * ${p.scale.toFixed(1)} + 3.7);
        diffuseColor.rgb *= 1.0 + ${p.colorVar.toFixed(3)} * (dn - 0.5) * 2.0;
        ${p.patina ? `float cav = smoothstep(0.55, 0.3, fbm3(vRest * ${(p.scale * 0.45).toFixed(1)} + 9.0)); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.5, 0.42), cav * ${p.patina.toFixed(2)});` : ''}
        ${kind === 'skin' ? 'diffuseColor.rgb *= 0.92 + 0.16 * vnoise(vRest * 18.0); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 0.92, 0.9), smoothstep(0.55, 0.9, vnoise(vRest * 7.0)) * 0.5);' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${kind === 'skin' ? `{
          // 피하 산란 근사: 빛이 비스듬히 스치는 가장자리와 역광에서 붉은 기가 번진다
          vec3 V = normalize(vViewPosition);
          float ndv = clamp(dot(normal, V), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 3.0);
          float wrap = clamp(dot(normal, uSunV) * 0.5 + 0.5, 0.0, 1.0);
          float back = pow(clamp(dot(V, -uSunV), 0.0, 1.0), 2.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.16, 0.08) * (rim * wrap * 0.35 + back * rim * 0.5);
        }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + ${p.roughVar.toFixed(3)} * (dn - 0.5), 0.05, 1.0);
        ${p.patina ? 'roughnessFactor = mix(roughnessFactor, 0.85, cav * 0.6);' : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${p.bump > 0 ? `{
          float hh = heightFn(vRest) * ${p.bump.toFixed(5)} * 60.0;
          vec2 dH = vec2(dFdx(hh), dFdy(hh));
          normal = perturbN(-vViewPosition, normal, dH, faceDirection);
        }` : ''}`);
    injectHitFlash(sh, 'player', [1.0, 0.2, 0.12]);
  };
  mat.customProgramCacheKey = () => `char-${kind}`;
  return mat;
}
