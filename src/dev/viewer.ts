import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCharMaterial } from '../render/charMaterials';
import { GladiatorAnimator, type PlayerView } from '../animation/gladiatorAnimator';
import { LionAnimator, type LionView } from '../animation/lionAnimator';
import { mapBones } from '../render/skeletonUtil';
import { createFurMaterial, createManeMaterial, makeEyeTexture, FUR_DEFAULT } from '../render/furMaterial';
const shared = { time: { value: 0 } };
const shellsN = parseInt(q0().get('shells') ?? '12');
function q0() { return new URLSearchParams(location.search); }

const q = new URLSearchParams(location.search);
const model = q.get('model') ?? 'lion';
const yaw = parseFloat(q.get('yaw') ?? '35') * Math.PI / 180;
const pitch = parseFloat(q.get('pitch') ?? '8') * Math.PI / 180;
const dist = parseFloat(q.get('dist') ?? '5');
const tx = parseFloat(q.get('tx') ?? '0'), ty = parseFloat(q.get('ty') ?? '0.9'), tz = parseFloat(q.get('tz') ?? '0');
const W = parseInt(q.get('w') ?? '1280'), H = parseInt(q.get('h') ?? '720');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x707478);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6a5a40, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x8a7658, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

const cam = new THREE.PerspectiveCamera(35, W / H, 0.05, 100);
cam.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, tz + Math.cos(yaw) * Math.cos(pitch) * dist);
cam.lookAt(tx, ty, tz);

const furMeshes: any[] = [];
const _gl = new GLTFLoader(); _gl.setMeshoptDecoder(MeshoptDecoder);
_gl.load(`/assets/models/${model}.glb`, (g) => {
  g.scene.traverse((o: any) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material as THREE.MeshStandardMaterial;
      if (m.name === 'mane') { o.material = createManeMaterial(shared); o.castShadow = false; }
      if (m.name === 'eye') { o.material = new THREE.MeshStandardMaterial({ map: makeEyeTexture(), roughness: 0.05 }); }
      if (m.name === 'mouth') { o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }); }
      if (m.name === 'ivory' || m.name === 'claw') { o.material.roughness = 0.4; }
      if (m.name === 'fur' && o.isSkinnedMesh) { furMeshes.push(o); }
      const kind = (m.userData?.kind as string) ?? '';
      if (model === 'gladiator' && kind) {
        let map: THREE.Texture | null = null;
        if (kind === 'shield_face') { map = new THREE.TextureLoader().load('/assets/textures/shield_face.png'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
        o.material = createCharMaterial(kind, m, { vertexColors: !!o.geometry.attributes.color, map });
      }
    }
  });
  for (const o of furMeshes) {
    o.material = createFurMaterial(0, shellsN, FUR_DEFAULT, shared);
    for (let i = 1; i < shellsN; i++) {
      const sh = new THREE.SkinnedMesh(o.geometry, createFurMaterial(i, shellsN, FUR_DEFAULT, shared));
      sh.bind(o.skeleton, o.bindMatrix); sh.frustumCulled = false; sh.receiveShadow = true;
      o.parent!.add(sh);
    }
  }
  scene.add(g.scene);
  const pose = q.get('pose');
  if (pose && model === 'gladiator') {
    const anim = new GladiatorAnimator();
    const bones = mapBones(g.scene, anim.rig);
    const T = parseFloat(q.get('t') ?? '0.3');
    const v: PlayerView = {
      mode: 'free', modeT: T, attackId: null, guardHeld: false, guardUp: false, guardUpT: 1, guardImpact: 0,
      moveLocal: { x: 0, z: 0 }, speed: 0, running: false, healApplied: false, hitDirLocal: { x: 0, z: -1 }, hitHeavy: false,
      dodgeBackstep: false, lookYaw: 0, staminaFrac: 1, hpFrac: 1, time: 1, deadT: T, victoryT: T,
    };
    if (pose.startsWith('l') || pose === 'heavy') { v.mode = 'attack'; v.attackId = pose === 'heavy' ? 'heavy' : (`light${pose.slice(1)}` as any); }
    if (pose === 'block') { v.guardHeld = true; v.guardUp = true; v.guardUpT = 1; }
    if (pose === 'blockhit') { v.guardHeld = true; v.guardUp = true; v.guardImpact = 0.8; }
    if (pose === 'dodge') v.mode = 'dodge';
    if (pose === 'back') { v.mode = 'dodge'; v.dodgeBackstep = true; }
    if (pose === 'heal') v.mode = 'heal';
    if (pose === 'hit') v.mode = 'hit';
    if (pose === 'break') v.mode = 'guardBreak';
    if (pose === 'dead') v.mode = 'dead';
    if (pose === 'victory') v.mode = 'victory';
    if (pose === 'walk') { v.speed = 3; v.moveLocal = { x: 0, z: 3 }; }
    if (pose === 'run') { v.speed = 5.6; v.moveLocal = { x: 0, z: 5.6 }; v.running = true; }
    if (pose === 'strafe') { v.speed = 3; v.moveLocal = { x: 3, z: 0 }; }
    const steps = pose === 'walk' || pose === 'run' || pose === 'strafe' ? Math.round(T * 60) : 3;
    for (let i = 0; i < steps; i++) anim.update(1 / 60, v);
    anim.rig.applyTo(bones);
    g.scene.traverse((o) => { if (o.name === 'flask') o.visible = anim.flaskVisible; });
  }
  if (pose && model === 'lion') {
    const anim = new LionAnimator();
    const bones = mapBones(g.scene, anim.rig);
    const T = parseFloat(q.get('t') ?? '0.3');
    const v: LionView = {
      mode: 'idle', modeT: T, attackId: null, attackT: T, mirror: false, speed: 0, moveLocal: { x: 0, z: 0 }, turnRate: 0, y: 0,
      lookYaw: parseFloat(q.get('look') ?? '0'), flinch: 0, flinchDirLocal: { x: 0, z: -1 }, landed: 0, deadT: T, time: 1, phase: 1,
      chargeBraking: false, chargeSpeed: 0, hpFrac: 1,
    };
    const atk = ['swipe', 'bite', 'pounce', 'charge', 'rear', 'swipeBite', 'pounceSwat', 'flurry', 'dashBite', 'backHop', 'quake', 'whirl'];
    if (pose === 'backHop') v.y = 0.75 * 4 * ((T - 0.08) / 0.52) * (1 - (T - 0.08) / 0.52);
    if (atk.includes(pose)) { v.mode = 'attack'; v.attackId = pose as any; if (pose === 'charge' && T > 1.2) { v.chargeSpeed = 8; v.speed = 8; v.moveLocal = { x: 0, z: 8 }; } }
    if (pose === 'walk') { v.mode = 'circle'; v.speed = 2.3; v.moveLocal = { x: 0, z: 2.3 }; }
    if (pose === 'run') { v.mode = 'approach'; v.speed = 5.2; v.moveLocal = { x: 0, z: 5.2 }; }
    if (pose === 'gallop') { v.mode = 'attack'; v.attackId = 'charge'; v.attackT = 2; v.chargeSpeed = 11; v.speed = 11; v.moveLocal = { x: 0, z: 11 }; }
    if (pose === 'roar') { v.mode = 'roar'; }
    if (pose === 'stagger') { v.mode = 'stagger'; }
    if (pose === 'dead') { v.mode = 'dying'; }
    const steps = ['walk', 'run', 'gallop'].includes(pose) ? Math.round(T * 60) : 3;
    for (let i = 0; i < steps; i++) anim.update(1 / 60, v);
    anim.rig.applyTo(bones);
    g.scene.getObjectByName('root')!.position.y = v.y;
  }
  let n = 0;
  const loop = () => { renderer.render(scene, cam); if (++n < 40) requestAnimationFrame(loop); else (window as any).__ready = true; };
  loop();
}, undefined, (e) => { (window as any).__err = String(e); });
