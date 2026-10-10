import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface SharedUniforms {
  time: { value: number };
}

const perturb = /* glsl */ `
vec3 perturbN(vec3 sp, vec3 sn, vec2 dH, float fd){
  vec3 sx = normalize(dFdx(sp)); vec3 sy = normalize(dFdy(sp));
  vec3 R1 = cross(sy, sn); vec3 R2 = cross(sn, sx);
  float det = dot(sx, R1) * fd;
  vec3 g = sign(det) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(det) * sn - g);
}`;

/** 모래: 월드 XZ 기반의 다중 스케일 색 변화, 곡선 갈퀴 자국, 알갱이 반짝임 */
export function createSandMaterial(shared: SharedUniforms, ellipse: { a: number; b: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.name = 'sand';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uEll = { value: new THREE.Vector2(ellipse.a, ellipse.b) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform vec2 uEll;
        ${NOISE_GLSL}
        ${perturb}
        float sandH(vec3 p){
          float h = 0.0;
          h += 0.55 * vnoise(vec3(p.xz * 1.1, 1.0));
          h += 0.35 * vnoise(vec3(p.xz * 3.7, 2.0));
          h += 0.25 * vnoise(vec3(p.xz * 13.0, 3.0));
          h += 0.18 * vnoise(vec3(p.xz * 47.0, 4.0));
          h += 0.10 * vnoise(vec3(p.xz * 160.0, 5.0));
          // 갈퀴 자국: 타원 등고선 방향의 줄무늬
          float e = length(p.xz / uEll);
          float rake = sin(e * 150.0 + vnoise(vec3(p.xz * 0.6, 7.0)) * 6.0);
          h += 0.07 * rake * smoothstep(0.15, 0.4, vnoise(vec3(p.xz * 0.4, 9.0)));
          return h;
        }`)
      .replace('#include <color_fragment>', `
        float eN = length(vWP.xz / uEll);
        float n1 = fbm3(vec3(vWP.xz * 0.28, 11.0));
        float n2 = fbm3(vec3(vWP.xz * 1.6, 13.0));
        vec3 sandA = vec3(0.50, 0.33, 0.15);
        vec3 sandB = vec3(0.38, 0.24, 0.10);
        vec3 sandC = vec3(0.60, 0.43, 0.22);
        vec3 col = mix(sandB, sandA, smoothstep(0.25, 0.75, n1));
        col = mix(col, sandC, smoothstep(0.55, 0.85, n2) * 0.5);
        // 벽 근처는 어둡게 (먼지/발자국이 많이 쌓임), 중앙 원은 약간 밝게
        col *= mix(1.0, 0.72, smoothstep(0.82, 1.02, eN));
        col *= mix(1.0, 1.08, smoothstep(0.5, 0.0, eN));
        // 알갱이 변주
        col *= 0.9 + 0.2 * h31(floor(vec3(vWP.xz * 260.0, 0.0)));
        // 작은 돌/자갈
        float peb = smoothstep(0.985, 0.995, h21(floor(vWP.xz * 9.0)));
        vec2 pf = fract(vWP.xz * 9.0) - 0.5; float pd = length(pf - (h22(floor(vWP.xz * 9.0)) - 0.5) * 0.6);
        col = mix(col, vec3(0.22, 0.19, 0.15) * (0.8 + 0.4 * h21(floor(vWP.xz * 9.0) + 3.0)), peb * smoothstep(0.17, 0.1, pd));
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hh = sandH(vWP) * 0.028;
          vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 90.0;
          normal = perturbN(-vViewPosition, normal, dH, faceDirection);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.92 - 0.1 * vnoise(vec3(vWP.xz * 30.0, 2.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // 모래알 반짝임 (태양 방향 의존이 아닌 약한 스파클)
          float sp = step(0.9965, h31(floor(vec3(vWP.xz * 420.0, 1.0))));
          totalEmissiveRadiance += vec3(0.5, 0.42, 0.28) * sp * 0.08;
        }`);
  };
  mat.customProgramCacheKey = () => 'sand';
  void shared;
  return mat;
}

export interface StoneOpts {
  tint?: THREE.ColorRepresentation;
  blockW?: number;
  blockH?: number;
  grime?: number;
  bump?: number;
  groundStain?: number;
  rough?: number;
}

/** 석회암/트래버틴 석재. uv 는 미터 단위 (u: 가로, v: 높이) */
export function createStoneMaterial(o: StoneOpts = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough ?? 0.92, metalness: 0 });
  mat.name = 'stone';
  const tint = new THREE.Color(o.tint ?? 0xd9c7a3);
  const bw = o.blockW ?? 1.25, bh = o.blockH ?? 0.52;
  const grime = o.grime ?? 1.0, bump = o.bump ?? 1.0, stain = o.groundStain ?? 1.0;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec2 vSU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vSU = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec2 vSU;
        ${NOISE_GLSL}
        ${perturb}
        float stoneH(vec2 p, out float mortar, out float tintV, out vec2 bid){
          float W = ${bw.toFixed(3)}, H = ${bh.toFixed(3)};
          float row = floor(p.y / H);
          float off = mod(row, 2.0) * 0.5 * W + h11(row * 3.1) * W;
          float x = p.x + off;
          float col = floor(x / W);
          vec2 bc = vec2(fract(x / W), fract(p.y / H));
          float dx = min(bc.x, 1.0 - bc.x) * W, dy = min(bc.y, 1.0 - bc.y) * H;
          float edge = min(dx, dy);
          mortar = smoothstep(0.006, 0.02, edge);
          bid = vec2(col, row);
          tintV = h21(bid + 7.0);
          float chip = vnoise(vec3(p * 22.0, tintV * 9.0));
          float bevel = smoothstep(0.0, 0.05, edge);
          return mortar * (0.55 + 0.4 * bevel) + 0.22 * chip + 0.12 * vnoise(vec3(p * 70.0, 3.0));
        }`)
      .replace('#include <color_fragment>', `
        float mortar, tintV; vec2 bid;
        float hS = stoneH(vSU, mortar, tintV, bid);
        vec3 base = vec3(${tint.r.toFixed(3)}, ${tint.g.toFixed(3)}, ${tint.b.toFixed(3)});
        base *= 0.86 + 0.26 * tintV;
        base = mix(base, base * vec3(1.06, 0.98, 0.86), h21(bid + 2.0));
        // 모르타르는 어둡게
        base = mix(vec3(0.28, 0.24, 0.19), base, mortar);
        // 얼룩 / 그을음 / 균열
        float g1 = fbm3(vec3(vWP.xz * 0.22 + vWP.y * 0.1, vWP.y * 0.4));
        float streak = vnoise(vec3(vWP.x * 3.0 + vWP.z * 3.0, vWP.y * 0.25, 5.0));
        float dirt = clamp(${grime.toFixed(2)} * (0.6 * smoothstep(0.35, 0.75, g1) + 0.5 * smoothstep(0.55, 0.9, streak) * smoothstep(8.0, 0.0, vWP.y)), 0.0, 1.0);
        base *= 1.0 - 0.38 * dirt;
        base = mix(base, base * vec3(0.78, 0.70, 0.58), ${stain.toFixed(2)} * smoothstep(1.4, 0.0, vWP.y));
        float crack = smoothstep(0.012, 0.0, abs(fbm3(vec3(vSU * 1.7, 1.0)) - 0.5) * 0.5 - 0.0) ;
        base *= 1.0 - 0.18 * crack * step(0.62, h21(bid + 9.0));
        diffuseColor.rgb *= base;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hh = hS * 0.02 * ${bump.toFixed(2)};
          vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 120.0;
          normal = perturbN(-vViewPosition, normal, dH, faceDirection);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (1.0 - mortar) * 0.05 - 0.12 * tintV, 0.55, 1.0);`);
  };
  mat.customProgramCacheKey = () => `stone-${bw}-${bh}-${grime}-${bump}-${stain}-${tint.getHexString()}`;
  return mat;
}

/** 깃발/천 재질 (바람에 흔들림) */
export function createBannerMaterial(shared: SharedUniforms, colors: { field: number; trim: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  mat.name = 'banner';
  const field = new THREE.Color(colors.field), trim = new THREE.Color(colors.trim);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vBU; varying float vFold;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBU = uv;
        // 위쪽(uv.y=1)은 고정, 아래로 갈수록 크게 흔들린다
        float k = (1.0 - uv.y);
        float ph = uTime * 1.6 + (modelMatrix[3].x + modelMatrix[3].z) * 0.6;
        float w = sin(ph + position.y * 1.9) * 0.5 + sin(ph * 1.7 + position.y * 3.1 + position.x * 2.0) * 0.25;
        transformed.z += w * k * k * 0.22;
        transformed.x += sin(ph * 1.3 + position.y * 2.3) * 0.04 * k;
        vFold = w;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vBU; varying float vFold;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `
        vec3 fcol = vec3(${field.r.toFixed(3)}, ${field.g.toFixed(3)}, ${field.b.toFixed(3)});
        vec3 tcol = vec3(${trim.r.toFixed(3)}, ${trim.g.toFixed(3)}, ${trim.b.toFixed(3)});
        vec2 u = vBU;
        float edge = min(min(u.x, 1.0 - u.x) * 2.0, 1.0);
        float border = smoothstep(0.1, 0.07, edge) + smoothstep(0.02, 0.0, abs(u.y - 0.12)) * 0.0;
        float band = smoothstep(0.04, 0.02, abs(u.y - 0.1)) + smoothstep(0.04, 0.02, abs(u.y - 0.86));
        // 중앙 문양: 마름모 + 번개
        vec2 c = vec2((u.x - 0.5) * 2.0, (u.y - 0.55) * 3.2);
        float diamond = smoothstep(0.02, 0.0, abs(c.x) + abs(c.y) - 0.62);
        float bolt = smoothstep(0.05, 0.0, abs(c.x - 0.12 * sin(c.y * 6.0)) - 0.05) * smoothstep(0.7, 0.5, abs(c.y));
        vec3 cloth = fcol * (0.85 + 0.3 * fbm3(vec3(u * vec2(40.0, 120.0), 2.0)));
        cloth = mix(cloth, tcol, clamp(border + band + diamond * 0.9 + bolt, 0.0, 1.0));
        cloth *= 0.86 + 0.28 * (vFold * 0.5 + 0.5);
        // 하단 헤진 가장자리
        float fray = step(0.015, u.y + 0.02 * sin(u.x * 60.0));
        diffuseColor.rgb *= cloth;
        if (fray < 0.5) discard;`);
  };
  mat.customProgramCacheKey = () => `banner-${colors.field}-${colors.trim}`;
  return mat;
}
