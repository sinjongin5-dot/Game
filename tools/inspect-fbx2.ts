import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

for (const name of ['attack', 'block', 'death', 'sheath', 'turn180']) {
  const buf = fs.readFileSync(`.tmp/fbx/${name}.fbx`);
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '') as THREE.Group & { animations: THREE.AnimationClip[] };
  const clip = obj.animations[0];
  const mixer = new THREE.AnimationMixer(obj);
  const act = mixer.clipAction(clip); act.play();
  const rh = obj.getObjectByName('mixamorigRightHand')!, lh = obj.getObjectByName('mixamorigLeftHand')!, hips = obj.getObjectByName('mixamorigHips')!, head = obj.getObjectByName('mixamorigHead')!;
  const n = Math.round(clip.duration * 30);
  const rows: string[] = [];
  let prev: THREE.Vector3 | null = null;
  for (let f = 0; f <= n; f += 3) {
    mixer.setTime(f / 30); obj.updateMatrixWorld(true);
    const p = rh.getWorldPosition(new THREE.Vector3()), l = lh.getWorldPosition(new THREE.Vector3()), h = hips.getWorldPosition(new THREE.Vector3()), hd = head.getWorldPosition(new THREE.Vector3());
    const sp = prev ? p.distanceTo(prev) / 0.1 : 0; prev = p.clone();
    rows.push(`f${String(f).padStart(3)} t=${(f / 30).toFixed(2)} hips(${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)}) head(${hd.x.toFixed(0)},${hd.y.toFixed(0)},${hd.z.toFixed(0)}) R(${(p.x - h.x).toFixed(0)},${(p.y).toFixed(0)},${(p.z - h.z).toFixed(0)}) spd=${sp.toFixed(0)}cm/s L(${(l.x - h.x).toFixed(0)},${l.y.toFixed(0)},${(l.z - h.z).toFixed(0)})`);
  }
  console.log(`=== ${name} dur ${clip.duration.toFixed(2)}s frames ${n}`);
  console.log(rows.join('\n'));
}
