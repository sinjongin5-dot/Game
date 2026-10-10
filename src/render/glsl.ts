/** 공용 GLSL 조각 */
export const NOISE_GLSL = /* glsl */ `
float h11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float h31(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = h31(i), b = h31(i+vec3(1,0,0)), c = h31(i+vec3(0,1,0)), d = h31(i+vec3(1,1,0));
  float e = h31(i+vec3(0,0,1)), g = h31(i+vec3(1,0,1)), h = h31(i+vec3(0,1,1)), k = h31(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;
