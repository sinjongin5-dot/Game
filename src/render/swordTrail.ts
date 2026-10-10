import * as THREE from 'three';

/** 검이 지나간 궤적 (공격 유효 구간에서만 표시, 빠르게 사라짐) */
export class SwordTrail {
  readonly mesh: THREE.Mesh;
  private n = 14;
  private pts: { b: THREE.Vector3; t: THREE.Vector3; age: number }[] = [];
  private pos: Float32Array;
  private alpha: Float32Array;
  private geo = new THREE.BufferGeometry();
  active = false;
  private life: number;

  constructor(color: [number, number, number] = [1.0, 0.92, 0.75], life = 0.16, alphaMul = 1) {
    this.life = life;
    this.pos = new Float32Array(this.n * 2 * 3);
    this.alpha = new Float32Array(this.n * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(${color.map((c) => c.toFixed(3)).join(',')}) * vA, vA * ${(0.6 * alphaMul).toFixed(3)}); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  push(base: THREE.Vector3, tip: THREE.Vector3) {
    this.pts.unshift({ b: base.clone(), t: tip.clone(), age: 0 });
    if (this.pts.length > this.n) this.pts.pop();
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      if (p) p.age += dt;
      const alive = p && p.age < this.life;
      const q = alive ? p : (this.pts[0] ?? null);
      const a = alive ? 1 - p.age / this.life : 0;
      const b = q ? q.b : new THREE.Vector3(), t = q ? q.t : new THREE.Vector3();
      this.pos.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      this.alpha[i * 2] = a * 0.25;
      this.alpha[i * 2 + 1] = a;
      if (alive) any = true;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aA') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = any;
  }

  clear() {
    this.pts.length = 0;
    this.mesh.visible = false;
  }
}
