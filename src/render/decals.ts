import * as THREE from 'three';

/** 모래 위에 남는 발자국/끌린 자국 (풀링, 서서히 사라짐) */
export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private cap = 160;
  private next = 0;
  private age: Float32Array;
  private life: Float32Array;
  private geo: THREE.PlaneGeometry;
  private fade: THREE.InstancedBufferAttribute;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3();

  constructor() {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(this.cap), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aFade', this.fade);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `attribute float aFade; varying float vF; varying vec2 vUv;
        void main(){ vF = aFade; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vF; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p * vec2(1.0, 1.0));
          float d = smoothstep(1.0, 0.45, r);
          float rim = smoothstep(0.55, 0.85, r) * smoothstep(1.0, 0.8, r);
          float a = (d * 0.38 + rim * 0.15) * vF;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.20, 0.145, 0.09), a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, mat, this.cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.age = new Float32Array(this.cap);
    this.life = new Float32Array(this.cap);
    this.dummyScale.set(0, 0, 0);
    for (let i = 0; i < this.cap; i++) {
      this.m4.compose(new THREE.Vector3(0, -10, 0), this.q.identity(), this.dummyScale);
      this.mesh.setMatrixAt(i, this.m4);
    }
  }

  add(x: number, z: number, yaw: number, w: number, l: number, life = 30, strength = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.m4.compose(new THREE.Vector3(x, 0.012, z), this.q, new THREE.Vector3(w, 1, l));
    this.mesh.setMatrixAt(i, this.m4);
    this.age[i] = 0;
    this.life[i] = life;
    this.fade.setX(i, strength);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        this.fade.setX(i, 0);
      } else {
        const cur = this.fade.getX(i);
        this.fade.setX(i, cur * (1 - dt / (this.life[i] - this.age[i] + 1e-3)));
      }
    }
    this.fade.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.cap; i++) this.fade.setX(i, 0);
    this.fade.needsUpdate = true;
  }
}
