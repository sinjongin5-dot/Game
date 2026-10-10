import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new FBXLoader();
const obj = loader.parse(ab, '') as THREE.Group & { animations: THREE.AnimationClip[] };
console.log('children', obj.children.map((c) => c.name + ':' + c.type));
const bones: string[] = [];
obj.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o.name); });
console.log('bones', bones.length, bones.slice(0, 70).join(','));
for (const c of obj.animations) {
  console.log('clip', c.name, 'dur', c.duration.toFixed(3), 'tracks', c.tracks.length);
  const t0 = c.tracks.find((t) => /Hips.*position/.test(t.name));
  if (t0) console.log(' hips pos track', t0.times.length, 'frames', 'first', Array.from(t0.values.slice(0, 3)).map((v) => v.toFixed(2)), 'last', Array.from(t0.values.slice(-3)).map((v) => v.toFixed(2)));
  const q = c.tracks.filter((t) => t.name.endsWith('.quaternion'));
  console.log(' quat tracks', q.length, 'frames', q[0]?.times.length, 'fps', (q[0].times.length - 1) / c.duration);
}
const hips = obj.getObjectByName('mixamorigHips');
console.log('hips pos', hips?.position.toArray(), 'obj scale', obj.scale.toArray());
