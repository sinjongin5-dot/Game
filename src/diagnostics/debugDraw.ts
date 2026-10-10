import * as THREE from 'three';
import { LION_ATTACKS } from '../combat/attackData';
import { attackIsActive, lionAttackVolume, lionHurtSpheres } from '../simulation/lion';
import { playerBladeSegment } from '../simulation/player';
import type { GameSim } from '../simulation/sim';

/** 숨김 진단: 히트박스/허트박스/충돌체 시각화 (F3 또는 ?debug) */
export class DebugDraw {
  readonly group = new THREE.Group();
  private spheres: THREE.Mesh[] = [];
  private capsule: THREE.Mesh;
  private blade: THREE.Line;
  private playerCap: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  private sphGeo = new THREE.SphereGeometry(1, 12, 8);

  constructor() {
    const mk = (c: number) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.8, depthTest: false });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.sphGeo, mk(i < 5 ? 0x33ff66 : 0xff3344));
      m.visible = false;
      m.renderOrder = 999;
      this.spheres.push(m);
      this.group.add(m);
    }
    this.capsule = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 4, 10), mk(0xff3344));
    this.capsule.visible = false;
    this.group.add(this.capsule);
    this.ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 48), mk(0xff3344));
    this.ringMesh.rotation.x = Math.PI / 2;
    this.ringMesh.visible = false;
    this.group.add(this.ringMesh);
    this.playerCap = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.84, 4, 10), mk(0x44aaff));
    this.group.add(this.playerCap);
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.blade = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffee33, depthTest: false }));
    this.blade.visible = false;
    this.blade.renderOrder = 999;
    this.group.add(this.blade);
    this.group.visible = false;
  }

  update(sim: GameSim) {
    if (!this.group.visible) return;
    const hs = lionHurtSpheres(sim.lion);
    hs.forEach((s, i) => {
      const m = this.spheres[i];
      m.visible = true;
      m.position.set(s.c.x, s.c.y, s.c.z);
      m.scale.setScalar(s.r);
    });
    for (let i = hs.length; i < 5; i++) this.spheres[i].visible = false;
    const vol = lionAttackVolume(sim.lion);
    const act = vol && attackIsActive(sim.lion);
    const sp = this.spheres[5];
    this.capsule.visible = false;
    this.ringMesh.visible = false;
    sp.visible = false;
    if (vol && vol.kind === 'ring') {
      this.ringMesh.visible = true;
      this.ringMesh.position.set(vol.c.x, 0.1, vol.c.z);
      this.ringMesh.scale.set(vol.r, vol.r, 1);
      (this.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(act ? 0xff2222 : 0x884444);
    } else if (vol && vol.kind === 'sphere') {
      sp.visible = true;
      sp.position.set(vol.c.x, vol.c.y, vol.c.z);
      sp.scale.setScalar(vol.r);
      (sp.material as THREE.MeshBasicMaterial).color.setHex(act ? 0xff2222 : 0x884444);
    } else if (vol && vol.kind === 'capsule') {
      this.capsule.visible = true;
      const mid = new THREE.Vector3((vol.a.x + vol.b.x) / 2, (vol.a.y + vol.b.y) / 2, (vol.a.z + vol.b.z) / 2);
      this.capsule.position.copy(mid);
      const dir = new THREE.Vector3(vol.b.x - vol.a.x, vol.b.y - vol.a.y, vol.b.z - vol.a.z);
      const len = dir.length();
      this.capsule.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.capsule.scale.set(vol.r, len / 1, vol.r);
      (this.capsule.material as THREE.MeshBasicMaterial).color.setHex(act ? 0xff2222 : 0x884444);
    }
    const p = sim.player;
    this.playerCap.position.set(p.pos.x, 0.95, p.pos.z);
    const seg = playerBladeSegment(p);
    this.blade.visible = !!seg;
    if (seg) {
      const pos = (this.blade.geometry.getAttribute('position') as THREE.BufferAttribute);
      pos.setXYZ(0, seg.a.x, seg.a.y, seg.a.z);
      pos.setXYZ(1, seg.b.x, seg.b.y, seg.b.z);
      pos.needsUpdate = true;
    }
    void LION_ATTACKS;
  }
}
