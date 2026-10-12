import * as THREE from 'three';

/**
 * 후처리 파이프라인 (WebGL2, HalfFloat HDR):
 *   장면 → HDR 렌더 타깃(MSAA + 깊이 텍스처)
 *        → 화면 공간 앰비언트 오클루전(반해상도, 깊이 기반 + 쌍방 블러)
 *        → 블룸(Karis 프리필터 + 다운/업샘플 체인)
 *        → 합성: 색수차 · 피사계 심도 · AO · 대기 원근(높이 안개 + 태양 산란) · 갓레이 · 블룸 · 노출/톤매핑(ACES) · 컬러 그레이딩 · 비네트 · 필름 그레인 · sRGB
 * 모든 효과는 품질 단계별로 켜고 끌 수 있고, 'low' 는 후처리를 쓰지 않는다.
 */

export interface PostConfig {
  enabled: boolean;
  msaa: number;
  ao: boolean;
  aoScale: number; // AO 해상도 배율
  bloom: boolean;
  godrays: boolean;
  dof: boolean;
  grain: boolean;
  aberration: boolean;
}

export interface PostParams {
  time: number;
  sunDir: THREE.Vector3; // 월드, 정규화
  focusDist: number; // 피사계 심도 초점 거리(m)
  exposure: number;
  /** 0..1: 전체 후처리 연출 강도(타이틀/게임 장면별로 조절) */
  dofStrength: number;
  /** 0..1: 타격 순간의 화면 충격(줌 블러·대비·비네트), 빠르게 감쇠하는 값 */
  pulse?: number;
  /** 0..1: 전투 분위기(더 차갑고 어둡고 채도 낮게) */
  mood?: number;
}

const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uProjInv; uniform mat4 uProj;
uniform vec2 uRes; uniform float uRadius; uniform float uIntensity;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec2 px = 1.0 / uRes;
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = (abs(pr.z - P.z) < abs(pl.z - P.z)) ? (pr - P) : (P - pl);
  vec3 dy = (abs(pu.z - P.z) < abs(pd.z - P.z)) ? (pu - P) : (P - pd);
  vec3 N = normalize(cross(dx, dy));
  if (N.z < 0.0) N = -N;
  float radiusPx = clamp(uRadius * uProj[1][1] * 0.5 * uRes.y / max(-P.z, 0.1), 3.0, 90.0);
  float rot = hash(gl_FragCoord.xy) * 6.2831853;
  float occ = 0.0;
  const int N_S = 14;
  for (int i = 0; i < N_S; i++){
    float t = (float(i) + 0.5) / float(N_S);
    float ang = t * 11.0 + rot;
    vec2 off = vec2(cos(ang), sin(ang)) * (0.12 + t * 0.88) * radiusPx * px;
    vec3 S = viewPos(vUv + off);
    vec3 v = S - P;
    float dist = length(v);
    float ndv = dot(N, v / max(dist, 1e-4));
    float range = 1.0 - smoothstep(uRadius * 0.6, uRadius * 1.6, dist);
    occ += max(0.0, ndv - 0.12) * range;
  }
  float ao = 1.0 - clamp(occ / float(N_S) * uIntensity * 2.2, 0.0, 1.0);
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

const AO_BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir;
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  float sum = texture2D(tAO, vUv).r * 0.2270270270, wsum = 0.2270270270;
  float offs[4]; offs[0] = 1.3846153846; offs[1] = 3.2307692308; offs[2] = -1.3846153846; offs[3] = -3.2307692308;
  float w[4]; w[0] = 0.3162162162; w[1] = 0.0702702703; w[2] = 0.3162162162; w[3] = 0.0702702703;
  for (int i = 0; i < 4; i++){
    vec2 uv = vUv + uDir * offs[i];
    float di = texture2D(tDepth, uv).x;
    float k = w[i] * exp(-abs(di - d0) * 3500.0);
    sum += texture2D(tAO, uv).r * k; wsum += k;
  }
  gl_FragColor = vec4(vec3(sum / wsum), 1.0);
}`;

const BLOOM_PRE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
vec3 prefilter(vec3 c){
  float br = max(max(c.r, c.g), c.b);
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * w;
}
void main(){
  // 13탭 다운샘플 (Karis 평균으로 반짝이는 점의 깜빡임 억제)
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 2.0)).rgb, b = texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb, c = texture2D(tSrc, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb, h = texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb, i = texture2D(tSrc, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb, k = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb, m = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 g0 = (d + e + g + h) * 0.25, g1 = (e + f + h + i) * 0.25, g2 = (a + b + d + e) * 0.25, g3 = (b + c + e + f) * 0.25, g4 = (j + k + l + m) * 0.25;
  g0 = prefilter(g0); g1 = prefilter(g1); g2 = prefilter(g2); g3 = prefilter(g3); g4 = prefilter(g4);
  float w0 = 1.0 / (1.0 + dot(g0, vec3(0.2126, 0.7152, 0.0722))), w1 = 1.0 / (1.0 + dot(g1, vec3(0.2126, 0.7152, 0.0722)));
  float w2 = 1.0 / (1.0 + dot(g2, vec3(0.2126, 0.7152, 0.0722))), w3 = 1.0 / (1.0 + dot(g3, vec3(0.2126, 0.7152, 0.0722)));
  float w4 = 1.0 / (1.0 + dot(g4, vec3(0.2126, 0.7152, 0.0722)));
  vec3 res = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  gl_FragColor = vec4(res, 1.0);
}`;

const BLOOM_DOWN_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 2.0)).rgb, b = texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb, c = texture2D(tSrc, vUv + uTexel * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel * vec2(-2.0, -2.0)).rgb, h = texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb, i = texture2D(tSrc, vUv + uTexel * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb, k = texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb, m = texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  vec3 res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(res, 1.0);
}`;

const BLOOM_UP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec3 s = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0 + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0 + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0
    + texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0 + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  gl_FragColor = vec4(texture2D(tPrev, vUv).rgb + s / 16.0 * uMix, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tAO; uniform sampler2D tBloom;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform mat4 uProjInv; uniform mat4 uCamWorld;
uniform vec3 uSunDir; uniform vec2 uSunUV; uniform float uSunFront; uniform vec3 uSunColor;
uniform float uTime; uniform float uExposure;
uniform float uAO; uniform float uBloom; uniform float uGod; uniform float uDof; uniform float uFocus; uniform float uGrain; uniform float uAberr;
uniform float uFogDensity; uniform float uFogHeight; uniform vec3 uFogColor; uniform vec3 uFogSun;
uniform float uPulse; uniform float uMood;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }

vec3 aces(vec3 x){
  // Narkowicz ACES 근사 (+ 약간의 입력 스케일)
  x *= 0.6;
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 sceneColor(vec2 uv){
#ifdef ABERR
  vec2 c = uv - 0.5; float r2 = dot(c, c);
  vec2 o = c * r2 * uAberr;
  return vec3(texture2D(tScene, uv + o).r, texture2D(tScene, uv).g, texture2D(tScene, uv - o).b);
#else
  return texture2D(tScene, uv).rgb;
#endif
}

void main(){
  float depth = texture2D(tDepth, vUv).x;
  bool sky = depth >= 0.99999;
  float dist = sky ? uFar : lin(depth);
  vec3 col = sceneColor(vUv);

#ifdef DOF
  if (!sky || uFocus > 0.0) {
    // 깊이 기반 CoC: 초점에서 멀수록 흐려진다 (전경 번짐 방지를 위해 샘플 CoC 와 비교)
    float coc = clamp(abs(dist - uFocus) / max(dist, 0.5), 0.0, 1.0);
    float maxPx = uDof * uRes.y / 1080.0 * 5.0;
    float rad = pow(coc, 1.4) * maxPx;
    if (rad > 0.6) {
      vec3 acc = col; float wsum = 1.0;
      float rot = hash(gl_FragCoord.xy) * 6.2831853;
      for (int i = 0; i < 14; i++){
        float t = (float(i) + 0.5) / 14.0;
        float a = t * 13.0 + rot;
        vec2 off = vec2(cos(a), sin(a)) * sqrt(t) * rad / uRes;
        vec2 uv = vUv + off;
        float ds = texture2D(tDepth, uv).x;
        float dsl = ds >= 0.99999 ? uFar : lin(ds);
        float cocS = clamp(abs(dsl - uFocus) / max(dsl, 0.5), 0.0, 1.0);
        // 초점이 맞은 앞쪽 물체의 색이 뒤로 번지지 않게 한다
        float w = (dsl < dist - 0.4) ? smoothstep(0.0, 0.5, cocS) : 1.0;
        acc += sceneColor(uv) * w; wsum += w;
      }
      col = acc / wsum;
    }
  }
#endif

  // 충격 줌 블러: 타격 순간 화면 중심에서 바깥으로 짧게 번진다
  if (uPulse > 0.03) {
    vec2 zd = (vUv - 0.5) * uPulse * 0.011;
    col = (col * 2.0 + texture2D(tScene, vUv - zd).rgb + texture2D(tScene, vUv - zd * 2.0).rgb + texture2D(tScene, vUv - zd * 3.0).rgb) / 5.0;
  }

  // 화면 공간 앰비언트 오클루전 (하늘 제외). 직사광에는 덜 영향이 가도록 밝은 곳은 약하게
  if (!sky) {
    float ao = texture2D(tAO, vUv).r;
    float l = luma(col);
    col *= mix(1.0, ao, uAO * (1.0 - 0.35 * smoothstep(0.5, 2.0, l)));
  }

  // 뷰 방향 / 월드 높이
  vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 viewDirV = normalize(vp.xyz / vp.w);
  vec3 viewDirW = normalize((uCamWorld * vec4(viewDirV, 0.0)).xyz);
  float sunDot = max(dot(viewDirW, uSunDir), 0.0);

  // 대기 원근: 높이 안개 + 태양 쪽에서 더 따뜻한 산란
  if (!sky) {
    vec3 camPos = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float y0 = camPos.y, y1 = camPos.y + viewDirW.y * dist;
    // 레이를 따라 높이 안개 밀도를 적분 (지수 밀도)
    float k = uFogHeight;
    float dy = y1 - y0;
    float integ = abs(dy) < 1e-3 ? exp(-k * max(y0, 0.0)) : (exp(-k * max(y0, 0.0)) - exp(-k * max(y1, 0.0))) / (k * dy);
    float fog = 1.0 - exp(-uFogDensity * dist * integ);
    vec3 fc = mix(uFogColor, uFogSun, pow(sunDot, 6.0));
    col = mix(col, fc, clamp(fog, 0.0, 0.92));
  }

#ifdef GODRAYS
  if (uSunFront > 0.0) {
    const int N_R = 28;
    vec2 delta = (uSunUV - vUv) / float(N_R) * 0.95;
    vec2 p = vUv + delta * hash(gl_FragCoord.xy + uTime);
    float illum = 0.0, decay = 1.0;
    for (int i = 0; i < N_R; i++){
      p += delta;
      vec2 q = clamp(p, vec2(0.001), vec2(0.999));
      float s = step(0.99999, texture2D(tDepth, q).x);
      illum += s * decay;
      decay *= 0.965;
    }
    float fall = smoothstep(1.6, 0.0, length((vUv - uSunUV) * vec2(uRes.x / uRes.y, 1.0)));
    col += uSunColor * (illum / float(N_R)) * uGod * fall * uSunFront;
  }
#endif

#ifdef BLOOM
  col += texture2D(tBloom, vUv).rgb * uBloom;
#endif

  col *= uExposure;
  vec3 ldr = aces(col);

  // 컬러 그레이딩: 그림자는 차갑게, 하이라이트는 따뜻하게, 중간 대비와 채도 살짝 상승
  float L = luma(ldr);
  ldr = mix(ldr, ldr * vec3(0.93, 0.99, 1.07), (1.0 - smoothstep(0.0, 0.55, L)) * 0.55);
  ldr = mix(ldr, ldr * vec3(1.03, 1.0, 0.95), smoothstep(0.35, 1.0, L) * 0.5);
  ldr = mix(vec3(luma(ldr)), ldr, 0.94);
  ldr = (ldr - 0.5) * 1.14 + 0.5;
  ldr = max(ldr, 0.0);

  // 전투 분위기: 차갑고 어둡고 채도를 낮춘다. 충격 순간에는 대비가 잠깐 오른다
  float mood = clamp(uMood, 0.0, 1.0), pul = clamp(uPulse, 0.0, 1.0);
  ldr = mix(ldr, vec3(luma(ldr)), 0.24 * mood);
  ldr *= mix(vec3(1.0), vec3(0.9, 0.97, 1.07), mood);
  ldr = mix(ldr, (ldr - 0.5) * 1.12 + 0.5, mood * 0.6 + pul * 0.45);

  // 비네트
  vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(1.15, 0.25, length(c) * 1.1);
  ldr *= mix(0.62, 1.0, vig) * (1.0 - (1.0 - vig) * (mood * 0.16 + pul * 0.2));
  ldr = max(ldr, 0.0);

  vec3 outc = toSRGB(ldr);
#ifdef GRAIN
  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  outc += g * uGrain * (0.35 + 0.65 * (1.0 - L));
#endif
  // 8비트 밴딩 방지 디더
  outc += (hash(gl_FragCoord.xy * 1.37 + 7.0) - 0.5) / 255.0;
  gl_FragColor = vec4(outc, 1.0);
}`;

function rt(w: number, h: number, type: THREE.TextureDataType = THREE.HalfFloatType, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false });
}

export class PostFX {
  config: PostConfig = { enabled: false, msaa: 0, ao: false, aoScale: 0.5, bloom: false, godrays: false, dof: false, grain: false, aberration: false };
  private scene: THREE.WebGLRenderTarget | null = null;
  private aoA: THREE.WebGLRenderTarget | null = null;
  private aoB: THREE.WebGLRenderTarget | null = null;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private quadGeo = new THREE.PlaneGeometry(2, 2);
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private aoMat: THREE.ShaderMaterial;
  private aoBlurMat: THREE.ShaderMaterial;
  private preMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial | null = null;
  private compKey = '';
  private w = 1;
  private h = 1;
  private white: THREE.DataTexture;
  private black: THREE.DataTexture;
  /** 노출/그레이딩 외 튜닝값 */
  tuning = { aoRadius: 1.15, aoIntensity: 0.9, bloomThreshold: 0.85, bloomKnee: 0.5, bloomStrength: 0.42, godStrength: 0.55, grainAmt: 0.022, aberration: 0.006, fogDensity: 0.0042, fogHeight: 0.085 };

  constructor(private renderer: THREE.WebGLRenderer) {
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.aoMat = mk(AO_FRAG, { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uIntensity: { value: 1 } });
    this.aoBlurMat = mk(AO_BLUR_FRAG, { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.preMat = mk(BLOOM_PRE_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } });
    this.downMat = mk(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(BLOOM_UP_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.quad = new THREE.Mesh(this.quadGeo, this.aoMat);
    this.quad.frustumCulled = false;
  }

  setConfig(c: PostConfig) {
    const rebuild = c.msaa !== this.config.msaa || c.ao !== this.config.ao || c.bloom !== this.config.bloom || c.aoScale !== this.config.aoScale;
    this.config = { ...c };
    if (rebuild) this.allocate();
  }

  get active() { return this.config.enabled; }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.allocate();
  }

  private allocate() {
    this.disposeTargets();
    if (!this.config.enabled) return;
    const { w, h } = this;
    const s = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: this.config.msaa, depthBuffer: true, generateMipmaps: false });
    s.depthTexture = new THREE.DepthTexture(w, h);
    s.depthTexture.type = THREE.UnsignedIntType;
    this.scene = s;
    if (this.config.ao) {
      const aw = Math.round(w * this.config.aoScale), ah = Math.round(h * this.config.aoScale);
      this.aoA = rt(aw, ah, THREE.HalfFloatType);
      this.aoB = rt(aw, ah, THREE.HalfFloatType);
    }
    if (this.config.bloom) {
      let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
      for (let i = 0; i < 6; i++) {
        this.bloomDown.push(rt(bw, bh));
        if (i < 5) this.bloomUp.push(rt(bw, bh));
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
    }
  }

  private disposeTargets() {
    this.scene?.dispose(); this.scene?.depthTexture?.dispose();
    this.aoA?.dispose(); this.aoB?.dispose();
    for (const t of [...this.bloomDown, ...this.bloomUp]) t.dispose();
    this.scene = null; this.aoA = null; this.aoB = null; this.bloomDown = []; this.bloomUp = [];
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  /** 장면을 후처리하여 화면(canvas)에 그린다 */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, p: PostParams) {
    const r = this.renderer;
    const c = this.config;
    if (!c.enabled || !this.scene) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    const prevAuto = r.autoClear;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    r.autoClear = true;
    const depth = this.scene.depthTexture!;
    camera.updateMatrixWorld();

    // AO
    let aoTex: THREE.Texture = this.white;
    if (c.ao && this.aoA && this.aoB) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = depth;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uProj.value.copy(camera.projectionMatrix);
      u.uRes.value.set(this.aoA.width, this.aoA.height);
      u.uRadius.value = this.tuning.aoRadius;
      u.uIntensity.value = this.tuning.aoIntensity;
      this.pass(this.aoMat, this.aoA);
      const b = this.aoBlurMat.uniforms;
      b.tDepth.value = depth;
      b.tAO.value = this.aoA.texture;
      b.uDir.value.set(1 / this.aoA.width, 0);
      this.pass(this.aoBlurMat, this.aoB);
      b.tAO.value = this.aoB.texture;
      b.uDir.value.set(0, 1 / this.aoA.height);
      this.pass(this.aoBlurMat, this.aoA);
      aoTex = this.aoA.texture;
    }

    // 블룸
    let bloomTex: THREE.Texture = this.black;
    if (c.bloom && this.bloomDown.length) {
      const pre = this.preMat.uniforms;
      pre.tSrc.value = this.scene.texture;
      pre.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
      pre.uThreshold.value = this.tuning.bloomThreshold;
      pre.uKnee.value = this.tuning.bloomKnee;
      this.pass(this.preMat, this.bloomDown[0]);
      for (let i = 1; i < this.bloomDown.length; i++) {
        const d = this.downMat.uniforms;
        d.tSrc.value = this.bloomDown[i - 1].texture;
        d.uTexel.value.set(1 / this.bloomDown[i - 1].width, 1 / this.bloomDown[i - 1].height);
        this.pass(this.downMat, this.bloomDown[i]);
      }
      // 업샘플: 가장 작은 단계에서 시작해 위로 누적
      let prev = this.bloomDown[this.bloomDown.length - 1].texture;
      for (let i = this.bloomUp.length - 1; i >= 0; i--) {
        const u = this.upMat.uniforms;
        u.tSrc.value = prev;
        u.tPrev.value = this.bloomDown[i].texture;
        u.uTexel.value.set(1 / this.bloomDown[i + 1].width, 1 / this.bloomDown[i + 1].height);
        u.uMix.value = 1;
        this.pass(this.upMat, this.bloomUp[i]);
        prev = this.bloomUp[i].texture;
      }
      bloomTex = prev;
    }

    // 합성
    const key = `${c.dof ? 'D' : ''}${c.godrays ? 'G' : ''}${c.bloom ? 'B' : ''}${c.grain ? 'N' : ''}${c.aberration ? 'A' : ''}`;
    if (!this.compMat || key !== this.compKey) {
      this.compMat?.dispose();
      const defines: Record<string, string> = {};
      if (c.dof) defines.DOF = ''; if (c.godrays) defines.GODRAYS = ''; if (c.bloom) defines.BLOOM = ''; if (c.grain) defines.GRAIN = ''; if (c.aberration) defines.ABERR = '';
      const V2 = THREE.Vector2, V3 = THREE.Vector3;
      this.compMat = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, defines, depthTest: false, depthWrite: false,
        uniforms: {
          tScene: { value: null }, tDepth: { value: null }, tAO: { value: null }, tBloom: { value: null },
          uRes: { value: new V2() }, uNear: { value: 0.1 }, uFar: { value: 400 }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
          uSunDir: { value: new V3() }, uSunUV: { value: new V2() }, uSunFront: { value: 0 }, uSunColor: { value: new V3(1.0, 0.82, 0.55) },
          uTime: { value: 0 }, uExposure: { value: 1 }, uAO: { value: 1 }, uBloom: { value: 0.4 }, uGod: { value: 0.5 }, uDof: { value: 0 }, uFocus: { value: 6 },
          uGrain: { value: 0.02 }, uAberr: { value: 0.01 },
          uPulse: { value: 0 }, uMood: { value: 0 },
          uFogDensity: { value: 0.006 }, uFogHeight: { value: 0.08 }, uFogColor: { value: new V3(0.78, 0.70, 0.56) }, uFogSun: { value: new V3(1.0, 0.80, 0.52) },
        },
      });
      this.compKey = key;
    }
    const u = this.compMat.uniforms;
    u.tScene.value = this.scene.texture;
    u.tDepth.value = depth;
    u.tAO.value = aoTex;
    u.tBloom.value = bloomTex;
    u.uRes.value.set(this.scene.width, this.scene.height);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uSunDir.value.copy(p.sunDir);
    const sp = camera.position.clone().addScaledVector(p.sunDir, 800).project(camera);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    u.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    u.uSunFront.value = Math.max(0, Math.min(1, fwd.dot(p.sunDir) * 3.0));
    u.uTime.value = p.time;
    u.uExposure.value = p.exposure;
    u.uAO.value = c.ao ? 1 : 0;
    u.uBloom.value = this.tuning.bloomStrength;
    u.uGod.value = this.tuning.godStrength;
    u.uDof.value = p.dofStrength;
    u.uFocus.value = p.focusDist;
    u.uGrain.value = this.tuning.grainAmt;
    u.uAberr.value = this.tuning.aberration;
    u.uPulse.value = p.pulse ?? 0;
    u.uMood.value = p.mood ?? 0;
    u.uFogDensity.value = this.tuning.fogDensity;
    u.uFogHeight.value = this.tuning.fogHeight;
    this.pass(this.compMat, null);
    r.autoClear = prevAuto;
  }

  dispose() {
    this.disposeTargets();
    this.quadGeo.dispose();
    for (const m of [this.aoMat, this.aoBlurMat, this.preMat, this.downMat, this.upMat, this.compMat]) m?.dispose();
  }
}
