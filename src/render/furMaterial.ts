import * as THREE from 'three';
import { injectHitFlash, LIGHTING } from './fx';
import { NOISE_GLSL } from './glsl';

export interface FurSettings {
  shells: number;
  length: number; // 미터
  density: number; // 셀/미터
}

export const FUR_DEFAULT: FurSettings = { shells: 12, length: 0.042, density: 520 };

export interface FurUniforms {
  uShell: { value: number };
  uFurLen: { value: number };
  uDensity: { value: number };
  uTime: { value: number };
  uGrav: { value: THREE.Vector3 };
  uBelly: { value: THREE.Color };
  uRim: { value: THREE.Color };
}

/** 셸 하나(0=기본 피부)에 해당하는 재질 */
export function createFurMaterial(shell: number, shells: number, s: FurSettings, shared: { time: { value: number } }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
  });
  mat.name = 'fur';
  const frac = shells <= 1 ? 0 : shell / (shells - 1);
  mat.userData.shell = frac;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShell = { value: frac };
    sh.uniforms.uFurLen = { value: s.length };
    sh.uniforms.uDensity = { value: s.density };
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uIsBase = { value: shell === 0 ? 1 : 0 };
    sh.uniforms.uSunV = LIGHTING.sunView;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uFurLen; uniform float uTime;
        varying vec3 vRest; varying vec3 vRestN; varying float vFurK;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vRestN = normal;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        #ifdef USE_COLOR_ALPHA
          float furK = color.a;
        #else
          float furK = 1.0;
        #endif
        vFurK = furK;
        float furL = uFurLen * furK * uShell;
        transformed += normalize(objectNormal) * furL;
        transformed.y -= furL * uShell * 0.55;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NOISE_GLSL}
        uniform float uShell; uniform float uDensity; uniform float uIsBase; uniform vec3 uSunV;
        varying vec3 vRest; varying vec3 vRestN; varying float vFurK;
        float strandCov(vec2 p, float shell){
          vec2 g = p * uDensity; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          vec2 o = (h22(id) - 0.5) * 0.55; float len = h21(id + 17.0);
          float r = mix(0.40, 0.06, shell) * (0.65 + 0.35 * len);
          float visible = step(shell, 0.35 + 0.65 * len);
          float d = length(f - o);
          return smoothstep(r + 0.06, r - 0.06, d) * visible;
        }`)
      .replace('#include <color_fragment>', `
        #ifdef USE_COLOR_ALPHA
          diffuseColor.rgb *= vColor.rgb;
        #else
          diffuseColor.rgb *= vColor.rgb;
        #endif
        {
          vec3 an = pow(abs(normalize(vRestN)), vec3(6.0)); an /= (an.x+an.y+an.z);
          float cov = strandCov(vRest.yz, uShell) * an.x + strandCov(vRest.xz + 3.1, uShell) * an.y + strandCov(vRest.xy + 7.7, uShell) * an.z;
          float furOn = step(0.001, vFurK);
          if (uIsBase < 0.5) {
            if (furOn < 0.5 || cov < 0.5) discard;
          }
          // 털 색: 뿌리 어둡고 끝은 밝게, 가닥별 변주
          float sv = h31(floor(vRest * 400.0));
          float n1 = fbm3(vRest * 6.0);
          float ao = mix(0.38, 1.0, pow(uShell, 0.7));
          float tip = smoothstep(0.55, 1.0, uShell) * 0.18;
          diffuseColor.rgb *= ao * (0.86 + 0.28 * sv) * (0.82 + 0.4 * n1);
          diffuseColor.rgb += tip * diffuseColor.rgb;
          // 배 쪽은 밝게
          float belly = smoothstep(0.1, -0.7, normalize(vRestN).y);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.16, 1.0), belly * 0.5);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // 털의 역광 투과(빛이 털 끝을 통과해 따뜻하게 빛남)와 가장자리 림 라이트
          vec3 Vf = normalize(vViewPosition);
          float ndvF = abs(dot(normal, Vf));
          float rimF = pow(1.0 - ndvF, 2.0);
          float backF = pow(clamp(dot(Vf, -uSunV), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.5) * (rimF * 0.32 * uShell + backF * (0.2 + 0.8 * uShell) * 0.9);
        }`);
  };
  const furCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    furCompile.call(mat, sh, r);
    injectHitFlash(sh, 'lion', [0.95, 0.75, 0.5]);
  };
  mat.customProgramCacheKey = () => `fur-${shell === 0 ? 'base' : 'shell'}`;
  return mat;
}

/** 갈기 재질: 알파 줄무늬 + 바람 흔들림 */
export function createManeMaterial(shared: { time: { value: number } }, shake: { value: number } = { value: 0 }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  mat.name = 'mane';
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uShake = shake;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uShake; varying vec2 vMUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMUv = uv;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        {
          float v = uv.y; float card = floor(uv.x);
          float sway = sin(uTime * 1.7 + card * 2.3) * 0.012 + sin(uTime * 3.1 + card * 5.1) * 0.006;
          float amp = 1.0 + uShake * 4.5;
          transformed.x += sway * v * v * amp + sin(uTime * 38.0 + card) * 0.015 * uShake * v;
          transformed.y += sin(uTime * 1.3 + card * 1.7) * 0.008 * v * v * amp;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMUv;
        ${NOISE_GLSL}`)
      .replace('#include <alphatest_fragment>', `
        {
          float card = floor(vMUv.x);
          float across = fract(vMUv.x) / 0.98;
          float v = vMUv.y;
          float w = 1.0 - smoothstep(0.30, 0.5, abs(across - 0.5));
          float streak = 0.5 + 0.5 * sin(across * (38.0 + 20.0 * h11(card)) + card * 7.1);
          streak = mix(streak, h11(floor(across * 14.0) + card * 3.0), 0.5);
          float tipFade = 1.0 - smoothstep(0.78, 1.0, v + (streak - 0.5) * 0.35);
          float a = w * (0.45 + 0.75 * streak) * tipFade;
          diffuseColor.a = a;
          diffuseColor.rgb *= 0.75 + 0.5 * streak;
          if (a < 0.42) discard;
        }`);
    injectHitFlash(sh, 'lion', [0.95, 0.75, 0.5]);
  };
  return mat;
}

export function makeEyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grad.addColorStop(0.0, '#050302');
  grad.addColorStop(0.22, '#0a0604');
  grad.addColorStop(0.24, '#6b3f0e');
  grad.addColorStop(0.45, '#c78a22');
  grad.addColorStop(0.62, '#e0a83a');
  grad.addColorStop(0.7, '#7a4a12');
  grad.addColorStop(0.78, '#241407');
  grad.addColorStop(1.0, '#120a04');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,220,120' : '90,50,10'},0.25)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 36, 128 + Math.sin(a) * 36);
    g.lineTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
