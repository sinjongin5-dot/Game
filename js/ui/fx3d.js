// 전투 3D 무대 (Three.js): 비스트와 카드 몬스터를 도형으로 조립한 3D 모델로 세우고,
// 돌진·피격·격파·소환 연출과 파티클, 카메라 흔들림, 데미지 숫자를 담당한다.
// 모델은 2D 스프라이트와 같은 look 파라미터에서 만들어지므로 데이터 추가 없이 전 종이 3D가 된다.
// DOM의 존(zone) 위치를 지면에 역투영해 모델을 놓기 때문에 UI 배치가 그대로 3D 배치가 된다.
(function (root) {
  const X = root.XG, T = root.THREE;
  const FX = (X.FX3D = { ok: false });
  if (!T) return;
  try { const c = document.createElement('canvas'); if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) return; } catch (e) { return; }
  FX.ok = true;

  const GEO = { s: new T.SphereGeometry(1, 20, 14), b: new T.BoxGeometry(1, 1, 1), c: new T.ConeGeometry(1, 1, 16), y: new T.CylinderGeometry(1, 1, 1, 16), t: new T.ConeGeometry(1, 1, 3), r: new T.TorusGeometry(0.42, 0.035, 6, 14, Math.PI) };
  const mats = {};
  const mat = (c, em) => mats[c + (em ? 'e' : '')] || (mats[c + (em ? 'e' : '')] = new T.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.04, emissive: em ? c : 0x000000, emissiveIntensity: em ? 0.7 : 0 }));
  const WHITE = new T.MeshBasicMaterial({ color: 0xffffff });
  const shadeHex = (h, f) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('');

  // ── 생물 모델 조립 ──
  function creature(look) {
    const g = new T.Group(), [c1, c2, c3] = look.c, dark = shadeHex(c1, 0.7), sh = look.shape, wings = [];
    const P = (geo, col, p, s, r, em) => { const m = new T.Mesh(GEO[geo], mat(col, em)); m.position.set(p[0], p[1], p[2]); if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); if (r) m.rotation.set(r[0], r[1], r[2]); m.castShadow = true; g.add(m); return m; };
    const both = (fn) => { fn(1); fn(-1); };
    let H, eyes, tail, wy = 1.25, wz = -0.3, hand = [0.6, 0.9, 0.15];
    if (sh === 'quad') {
      both((d) => { P('y', dark, [d * 0.28, 0.22, 0.4], [0.12, 0.44, 0.12]); P('y', dark, [d * 0.28, 0.22, -0.4], [0.12, 0.44, 0.12]); });
      P('s', c1, [0, 0.72, 0], [0.5, 0.46, 0.74]); P('s', c2, [0, 0.6, 0.05], [0.4, 0.36, 0.6]);
      if (look.mane) P('s', c3, [0, 0.98, 0.42], [0.5, 0.5, 0.34]);
      P('s', c1, [0, 1.02, 0.72], 0.4); P('s', c2, [0, 0.92, 1.02], [0.22, 0.17, 0.2]); P('s', '#1a1626', [0, 0.98, 1.2], 0.05);
      H = [0, 1.02, 0.72, 0.4]; eyes = [0.17, 1.12, 1.05]; tail = [0, 0.85, -0.72]; wy = 1.15; wz = -0.1; hand = [0.5, 0.8, 0.5];
    } else if (sh === 'biped') {
      if (look.robe) { P('c', c1, [0, 0.66, 0], [0.58, 1.32, 0.58]); P('b', c3, [0, 0.6, 0.47], [0.1, 0.9, 0.06], [-0.4, 0, 0]); }
      else { both((d) => P('y', dark, [d * 0.18, 0.2, 0], [0.13, 0.4, 0.13])); P('s', c1, [0, 0.78, 0], [0.42, 0.5, 0.36]); P('s', c2, [0, 0.74, 0.12], [0.3, 0.38, 0.28]); }
      both((d) => P('s', c1, [d * 0.5, 0.88, 0.05], [0.13, 0.27, 0.13], [0, 0, d * 0.3]));
      if (look.mane) P('s', c3, [0, 1.2, -0.06], [0.5, 0.26, 0.45]);
      P('s', look.armor || look.robe ? c2 : c1, [0, 1.45, 0], 0.4);
      if (!look.armor && !look.robe) P('s', c2, [0, 1.38, 0.2], [0.26, 0.2, 0.22]);
      if (look.robe) P('c', c1, [0, 1.92, -0.03], [0.44, 0.56, 0.44]);
      if (look.armor) { P('s', '#9aa4b8', [0, 1.56, -0.03], [0.43, 0.33, 0.43]); P('c', c1, [0, 1.98, -0.1], [0.08, 0.36, 0.14]); }
      H = [0, 1.45, 0, 0.4]; eyes = [0.15, 1.5, 0.36]; tail = [0, 0.55, -0.38];
    } else if (sh === 'bird') {
      P('s', c1, [0, 0.78, 0], [0.42, 0.5, 0.42]); P('s', c2, [0, 0.72, 0.14], [0.3, 0.38, 0.3]);
      P('s', c1, [0, 1.38, 0.12], 0.33); P('c', c3, [0, 1.34, 0.52], [0.11, 0.3, 0.11], [Math.PI / 2, 0, 0]);
      both((d) => { const w = P('s', dark, [d * 0.66, 0.98, -0.05], [0.52, 0.09, 0.3], [0, 0, d * 0.45]); w.userData.d = d; wings.push(w); P('b', c3, [d * 0.15, 0.06, 0.08], [0.12, 0.1, 0.22]); });
      P('b', dark, [0, 0.52, -0.45], [0.3, 0.06, 0.42], [0.5, 0, 0]);
      H = [0, 1.38, 0.12, 0.33]; eyes = [0.14, 1.45, 0.4]; tail = null; hand = [0.5, 0.8, 0.3];
    } else if (sh === 'fish') {
      P('s', c1, [0, 0.9, 0], [0.42, 0.52, 0.85]); P('s', c2, [0, 0.78, 0.06], [0.36, 0.4, 0.7]);
      P('t', dark, [0, 0.9, -1.05], [0.07, 0.5, 0.58], [Math.PI / 2, 0, 0]); P('t', dark, [0, 1.5, -0.05], [0.06, 0.42, 0.4]);
      both((d) => P('t', dark, [d * 0.46, 0.72, 0.1], [0.3, 0.34, 0.06], [0, 0, -d * 1.2]));
      H = [0, 0.95, 0.5, 0.42]; eyes = [0.3, 1.02, 0.62]; tail = null; hand = [0.5, 0.9, 0.3];
    } else if (sh === 'serpent') {
      for (let i = 0; i <= 10; i++) { const t = i / 10; P('s', i % 2 ? c1 : shadeHex(c1, 0.9), [Math.sin(t * 5.2) * 0.3 * (1 - t * 0.6), 0.22 + t * t * 1.5, -0.75 + t * 1.05 + Math.sin(t * 6) * 0.12], 0.2 + 0.13 * Math.sin(t * Math.PI * 0.85)); }
      P('s', c1, [0, 1.85, 0.42], 0.38); P('s', c2, [0, 1.76, 0.7], [0.22, 0.16, 0.2]);
      H = [0, 1.85, 0.42, 0.38]; eyes = [0.16, 1.95, 0.72]; tail = [0, 0.3, -0.85]; wy = 1.35; wz = -0.15; hand = [0.4, 1.2, 0.3];
    } else if (sh === 'blob') {
      both((d) => P('s', dark, [d * 0.3, 0.08, 0.2], [0.18, 0.1, 0.22]));
      P('s', c1, [0, 0.62, 0], [0.72, 0.6, 0.68]); P('s', c2, [0, 0.45, 0.16], [0.5, 0.36, 0.55]); P('s', shadeHex(c1, 1.25), [-0.25, 0.96, 0.3], [0.16, 0.1, 0.1]);
      H = [0, 0.66, 0, 0.6]; eyes = [0.24, 0.8, 0.6]; tail = [0, 0.5, -0.66]; wy = 0.9; wz = -0.2;
    } else {
      both((d) => { P('b', dark, [d * 0.3, 0.22, 0], [0.34, 0.44, 0.4]); P('b', c1, [d * 0.74, 0.86, 0], [0.32, 0.8, 0.4]); P('b', c3, [d * 0.74, 0.36, 0], [0.37, 0.22, 0.45]); P('b', '#ffe060', [d * 0.14, 1.62, 0.28], [0.12, 0.1, 0.05], null, true); });
      P('b', c1, [0, 0.88, 0], [1.05, 0.9, 0.65]); P('b', c2, [0, 0.92, 0.3], [0.7, 0.5, 0.1]); P('b', c1, [0, 1.6, 0], [0.6, 0.52, 0.55]); P('b', c3, [-0.2, 1.22, 0.34], [0.16, 0.16, 0.05]);
      H = [0, 1.6, 0, 0.3]; eyes = null; tail = [0, 0.7, -0.4]; hand = [0.9, 0.9, 0.25];
    }
    const [hx, hy, hz, hr] = H, e = look.ears;
    if (e === 'point') both((d) => P('c', c1, [hx + d * hr * 0.6, hy + hr * 0.95, hz], [hr * 0.26, hr * 0.75, hr * 0.2], [0, 0, -d * 0.25]));
    else if (e === 'round') both((d) => P('s', c1, [hx + d * hr * 0.75, hy + hr * 0.72, hz], hr * 0.32));
    else if (e === 'leaf') { P('s', '#4fb84a', [hx + 0.08, hy + hr + 0.2, hz], [0.09, 0.3, 0.17], [0, 0, -0.45]); P('s', '#7ad060', [hx - 0.1, hy + hr + 0.12, hz], [0.07, 0.22, 0.13], [0, 0, 0.6]); }
    else if (e === 'fin') both((d) => P('t', c3, [hx + d * hr * 1.05, hy + hr * 0.3, hz - 0.05], [hr * 0.5, hr * 0.85, 0.05], [0, 0, -d * 1.0]));
    else if (e === 'antenna') both((d) => { P('y', dark, [hx + d * 0.14, hy + hr + 0.18, hz + 0.1], [0.02, 0.4, 0.02], [0, 0, -d * 0.3]); P('s', c3, [hx + d * 0.2, hy + hr + 0.38, hz + 0.1], 0.07); });
    const hc = sh === 'golem' ? c3 : '#f4f0e0';
    if (look.horn === 1) P('c', hc, [hx, hy + hr + 0.18, hz + 0.1], [0.09, 0.46, 0.09]);
    else if (look.horn === 2) both((d) => P('c', hc, [hx + d * hr * 0.55, hy + hr + 0.12, hz], [0.08, 0.42, 0.08], [0, 0, -d * 0.35]));
    if (look.wings && sh !== 'bird') both((d) => { const w = P('t', c3, [d * 0.62, wy, wz], [0.75, 0.95, 0.05], [0, 0, -d * 0.95]); w.userData.d = d; wings.push(w); });
    if (tail && look.tail) {
      const [tx, ty, tz] = tail, t = look.tail;
      if (t === 'flame') { P('y', c1, [tx, ty + 0.05, tz - 0.08], [0.05, 0.3, 0.05], [-0.8, 0, 0]); P('c', '#f0672e', [tx, ty + 0.4, tz - 0.25], [0.18, 0.5, 0.18], null, true); P('c', '#ffcf3a', [tx, ty + 0.33, tz - 0.25], [0.1, 0.3, 0.1], null, true); }
      else if (t === 'leaf') P('s', '#4fb84a', [tx, ty + 0.2, tz - 0.2], [0.06, 0.3, 0.18], [-0.6, 0, 0]);
      else if (t === 'bolt') { P('b', '#f2c318', [tx, ty + 0.12, tz - 0.12], [0.07, 0.36, 0.12], [-0.9, 0, 0], true); P('b', '#f2c318', [tx, ty + 0.4, tz - 0.3], [0.07, 0.36, 0.12], [0.3, 0, 0], true); }
      else if (t === 'fin') P('t', dark, [tx, ty, tz - 0.22], [0.06, 0.46, 0.42], [Math.PI / 2, 0, 0]);
      else P('y', c1, [tx, ty + 0.15, tz - 0.2], [0.04, 0.55, 0.04], [-0.9, 0, 0]);
    }
    const [gx, gy, gz] = hand, gr = look.gear;
    if (gr === 'sword' || gr === 'dual') { both((d) => { if (d < 0 && gr !== 'dual') return; P('b', '#e4e8f0', [d * gx, gy + 0.5, gz + 0.1], [0.07, 0.95, 0.03], [0.25, 0, 0]); P('b', '#c8a040', [d * gx, gy + 0.03, gz], [0.26, 0.06, 0.08]); }); }
    else if (gr === 'spear') { P('y', '#8a6a48', [gx, gy + 0.3, gz], [0.03, 2.0, 0.03]); P('c', '#e4e8f0', [gx, gy + 1.42, gz], [0.08, 0.3, 0.08]); }
    else if (gr === 'staff') { P('y', '#8a6a48', [gx, gy + 0.15, gz], [0.035, 1.7, 0.035]); P('s', c3, [gx, gy + 1.08, gz], 0.14, null, true); }
    else if (gr === 'club') P('y', '#8a6a48', [gx, gy + 0.4, gz], [0.09, 0.75, 0.09], [0.2, 0, 0]);
    else if (gr === 'bow') { const m = new T.Mesh(GEO.r, mat('#8a6a48')); m.position.set(-gx, gy, gz + 0.1); m.rotation.set(0, Math.PI / 2, -Math.PI / 2); m.castShadow = true; g.add(m); }
    else if (gr === 'shield') { P('y', '#607088', [-gx, gy, gz + 0.12], [0.34, 0.06, 0.34], [Math.PI / 2, 0, 0]); P('s', '#c8d0e0', [-gx, gy, gz + 0.16], [0.14, 0.14, 0.05]); }
    if (eyes) both((d) => { P('s', '#1a1626', [d * eyes[0], eyes[1], eyes[2]], [0.07, 0.085, 0.05]); P('s', '#ffffff', [d * eyes[0] - 0.02, eyes[1] + 0.03, eyes[2] + 0.035], 0.025); });
    g.scale.setScalar(look.size || 0.8);
    g.userData = { wings, top: (hy + hr + 0.3) * (look.size || 0.8) };
    return g;
  }
  FX.creature = creature;

  // 카드 판 텍스처 (지면에 눕는 카드)
  const texCache = {};
  function cardTex(id) {
    const key = id || 'back';
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 128;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    if (!id) {
      g.fillStyle = '#3a2a58'; g.fillRect(0, 0, 96, 128);
      g.strokeStyle = '#4a3870'; g.lineWidth = 6; for (let i = -128; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
      g.strokeStyle = '#f2c94c'; g.lineWidth = 5; g.strokeRect(3, 3, 90, 122); g.translate(48, 64); g.rotate(Math.PI / 4); g.lineWidth = 3; g.strokeRect(-18, -18, 36, 36);
    } else {
      const c = X.CARDS[id];
      g.fillStyle = c.kind === 'spell' ? '#2f9a8a' : c.kind === 'trap' ? '#b0478a' : c.text ? '#d9824a' : '#c9a66b'; g.fillRect(0, 0, 96, 128);
      g.fillStyle = '#f4ead0'; g.fillRect(8, 16, 80, 72); g.drawImage(X.Art.card(id), 12, 16, 72, 72);
      g.strokeStyle = '#1a1626'; g.lineWidth = 4; g.strokeRect(2, 2, 92, 124); g.lineWidth = 2; g.strokeRect(8, 16, 80, 72);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(8, 96, 80, 22);
    }
    const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.encoding = T.sRGBEncoding;
    return (texCache[key] = t);
  }

  const PAL = { field: ['#8fd0f5', '#74c878', '#2f7a40'], forest: ['#3f7a5c', '#3f8a50', '#184a28'], coast: ['#7cc0f5', '#f2e2a8', '#c8a868'], cave: ['#1c1824', '#7a6858', '#3a2e2c'], city: ['#6a58a8', '#9a96a8', '#4a4658'], indoor: ['#2e2648', '#c89858', '#6a4a28'] };
  let R = null, scene, cam, ground, raf = 0, clock = 0, last = 0, host = null;
  const slots = {}, dying = [], tweens = [], parts = [];
  const camBase = new T.Vector3(0, 8.2, 10.5), camLook = new T.Vector3(0, 0.4, 0.4);
  let shake = 0;

  function init() {
    R = new T.WebGLRenderer({ antialias: true, alpha: false });
    R.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    R.setSize(960, 600, false);
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    R.outputEncoding = T.sRGBEncoding;
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    R.domElement.id = 'b3d';
    scene = new T.Scene();
    cam = new T.PerspectiveCamera(34, 960 / 600, 0.5, 120);
    cam.position.copy(camBase); cam.lookAt(camLook); cam.updateMatrixWorld();
    scene.add(new T.HemisphereLight(0xffffff, 0x443355, 0.55));
    const sun = new T.DirectionalLight(0xfff2dd, 0.8);
    sun.position.set(-6, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    scene.add(sun);
    ground = new T.Mesh(new T.PlaneGeometry(56, 56), new T.MeshStandardMaterial({ roughness: 0.95, color: 0xb8b8b8 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  }
  function groundTex(c1, c2) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(256, 256, 30, 256, 256, 240);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 60, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
    const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t;
  }

  FX.start = function (el, bg) {
    if (!R) init();
    host = el;
    const [sky, g1, g2] = PAL[bg] || PAL.field;
    scene.background = new T.Color(sky);
    scene.fog = new T.Fog(sky, 22, 60);
    if (ground.material.map) ground.material.map.dispose();
    ground.material.map = groundTex(g1, g2); ground.material.needsUpdate = true;
    for (const k in slots) { scene.remove(slots[k].obj); delete slots[k]; }
    for (const d of dying.splice(0)) scene.remove(d.obj);
    for (const p of parts.splice(0)) scene.remove(p.m);
    tweens.length = 0; shake = 0;
    el.insertBefore(R.domElement, el.firstChild);
    last = performance.now();
    cancelAnimationFrame(raf);
    const loop = (now) => { raf = requestAnimationFrame(loop); frame(Math.min(50, now - last)); last = now; };
    raf = requestAnimationFrame(loop);
  };
  FX.stop = function () { cancelAnimationFrame(raf); host = null; };

  // 화면 좌표(스테이지 960x600 기준) -> 지면(y=0) 위의 점
  const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function toGround(sx, sy) {
    cam.position.copy(camBase); cam.lookAt(camLook); cam.updateMatrixWorld();
    ray.setFromCamera({ x: (sx / 960) * 2 - 1, y: -((sy / 600) * 2 - 1) }, cam);
    const v = new T.Vector3();
    return ray.ray.intersectPlane(plane, v) || v.set(0, 0, 0);
  }
  function stagePos(el, fx, fy) {
    const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect(), k = 960 / hr.width;
    return [(r.left - hr.left + r.width * fx) * k, (r.top - hr.top + r.height * fy) * k, r.width * k];
  }
  function toScreen(v) {
    const p = v.clone().project(cam);
    return [(p.x + 1) / 2 * 960, (1 - p.y) / 2 * 600];
  }

  function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }
  function burst(pos, color, n, speed, up) {
    const m0 = new T.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(GEO.s, m0); m.scale.setScalar(0.05 + Math.random() * 0.07); m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      scene.add(m);
      parts.push({ m, v: new T.Vector3(Math.cos(a) * Math.cos(e), up ? 1 + Math.random() : Math.sin(e) * 1.4, Math.sin(a) * Math.cos(e)).multiplyScalar(speed * (0.5 + Math.random())), life: 0.5 + Math.random() * 0.4, g: up ? -1 : 6 });
    }
  }
  function ring(pos, color, r) { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, m = new T.Mesh(GEO.s, new T.MeshBasicMaterial({ color })); m.scale.setScalar(0.07); m.position.set(pos.x + Math.cos(a) * r, 0.1, pos.z + Math.sin(a) * r); scene.add(m); parts.push({ m, v: new T.Vector3(0, 1.8 + Math.random(), 0), life: 0.8, g: -0.5 }); } }
  function flash(s) {
    if (!s.model) return;
    const ms = []; s.model.traverse((o) => { if (o.isMesh) { ms.push([o, o.material]); o.material = WHITE; } });
    setTimeout(() => ms.forEach(([o, m]) => (o.material = m)), 90);
  }
  function kill(s) {
    dying.push({ obj: s.obj, t: 0 });
    if (s.model) burst(s.obj.position.clone().setY(0.8 * s.scale), 0xffffff, 16, 3.2 * s.scale);
  }

  function make(d) {
    const obj = new T.Group(), s = { key: d.key, obj, side: d.side, scale: d.scale, home: d.pos.clone(), phase: Math.random() * 6, model: null, card: null, def: null, down: false };
    obj.position.copy(d.pos); obj.scale.setScalar(d.scale);
    if (d.card !== undefined) {
      const c = new T.Mesh(new T.PlaneGeometry(0.95, 1.27), new T.MeshStandardMaterial({ map: cardTex(d.faceDown ? null : d.card), roughness: 0.6 }));
      c.rotation.x = -Math.PI / 2; c.position.y = 0.03; c.receiveShadow = true; obj.add(c); s.card = c;
    } else {
      const p = new T.Mesh(GEO.y, new T.MeshStandardMaterial({ color: 0xe8e4f4, roughness: 0.5, transparent: true, opacity: 0.55 }));
      p.scale.set(1.05, 0.06, 1.05); p.position.y = 0.03; p.receiveShadow = true; obj.add(p);
    }
    if (d.look) {
      s.model = creature(d.look);
      const hold = new T.Group(); hold.add(s.model); hold.rotation.y = d.side === 0 ? Math.PI * 0.82 : 0.22; obj.add(hold); s.hold = hold;
      s.base = s.model.scale.x;
      s.model.scale.setScalar(0.01);
      tween(380, (k) => { const e = 1 + 0.25 * Math.sin(k * Math.PI); s.model.scale.setScalar(s.base * k * e); }, () => s.model.scale.setScalar(s.base));
      ring(d.pos, d.color || 0xf2c94c, 0.6 * d.scale);
    }
    scene.add(obj);
    return s;
  }

  // 화면 상태에 맞춰 모델을 맞춘다 (DOM 렌더 직후 호출)
  FX.sync = function (v) {
    if (!host) return;
    const want = {};
    v.sides.forEach((sd, i) => {
      const box = host.querySelector('#bs' + i);
      if (!box) return;
      if (sd.kind === 'tamer') {
        const z = box.querySelector('.tp-sprite'), b = sd.team[sd.active];
        if (!z) return;
        const [x, y] = stagePos(z, 0.5, i ? 0.84 : 0.7), pos = toGround(x, y), edge = toGround(x + (i ? 54 : 60), y);
        want[i + ':beast'] = { key: b.sp + ':' + sd.active, side: i, pos, scale: pos.distanceTo(edge), look: X.BEASTS[b.sp].look, down: b.hp <= 0, color: X.TYPES[X.BEASTS[b.sp].types[0]].color };
      } else {
        sd.mons.forEach((m, zi) => {
          if (!m) return;
          const z = box.querySelector(`.mz[data-zone="${zi}"]`);
          if (!z) return;
          const [x, y] = stagePos(z, 0.5, 0.58), pos = toGround(x, y), edge = toGround(x + 46, y);
          const hid = m.hidden || m.faceDown, c = m.id ? X.CARDS[m.id] : null;
          want[i + ':' + zi] = { key: m.uid + (hid ? ':fd' : ':' + m.id), side: i, pos, scale: pos.distanceTo(edge), card: m.id || null, faceDown: hid, look: hid ? null : c.look, def: m.pos === 'def', color: c && !hid ? X.TYPES[c.attr].color : 0xffffff };
        });
      }
    });
    for (const k in slots) if (!want[k] || want[k].key !== slots[k].key) { kill(slots[k]); delete slots[k]; }
    for (const k in want) {
      const d = want[k];
      let s = slots[k];
      if (!s) s = slots[k] = make(d);
      s.home.copy(d.pos); s.scale = d.scale; s.obj.scale.setScalar(d.scale);
      if (!s.busy) s.obj.position.copy(d.pos);
      if (s.card && s.def !== d.def) { s.def = d.def; s.card.rotation.z = d.def ? Math.PI / 2 : 0; if (s.hold) s.hold.scale.setScalar(d.def ? 0.8 : 1); }
      if (s.model && d.down && !s.down) { s.down = true; tween(450, (t) => { s.model.rotation.z = t * 1.5; s.model.position.y = -t * 0.25; s.hold.scale.setScalar(1 - t * 0.25); }); burst(s.home.clone().setY(0.6), 0x8888aa, 10, 2); }
    }
  };
  function slot(side, zone) { return slots[side + ':' + (zone == null || zone === 'direct' ? 'beast' : zone)]; }
  function center(side) { const ks = Object.keys(slots).filter((k) => k[0] === String(side)); if (!ks.length) return toGround(330, side ? 150 : 380); const v = new T.Vector3(); ks.forEach((k) => v.add(slots[k].home)); return v.divideScalar(ks.length); }
  function lunge(s, to) {
    if (!s || s.busy) return;
    s.busy = true;
    const dir = to.clone().sub(s.home); const dist = Math.min(dir.length() * 0.55, 3.2); dir.normalize();
    tween(430, (k) => { const e = Math.sin(k * Math.PI); s.obj.position.copy(s.home).addScaledVector(dir, e * dist); s.obj.position.y = Math.sin(k * Math.PI) * 0.35 * s.scale; }, () => { s.busy = false; s.obj.position.copy(s.home); });
  }
  FX.num = function (pos, text, cls) {
    if (!host) return;
    const [x, y] = Array.isArray(pos) ? pos : toScreen(pos);
    const d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    host.appendChild(d); setTimeout(() => d.remove(), 950);
  };
  FX.fx = function (f) {
    if (!host || !f) return;
    const s = f.zone != null ? slot(f.side, f.zone) : slot(f.side, 'beast');
    const col = f.type ? X.TYPES[f.type].color : null;
    const top = (q) => q.home.clone().setY((q.model ? q.model.userData.top : 0.4) * q.scale + 0.2);
    switch (f.k) {
      case 'move': { const a = slot(f.side, 'beast'); if (a && f.target !== null && f.target !== undefined) { const t = slot(1 - f.side, f.target); lunge(a, t ? t.home : center(1 - f.side)); } else if (a) ring(a.home, col || 0xffffff, 0.7 * a.scale); break; }
      case 'attack': { const a = slot(f.side, f.zone), t = f.target === 'beast' ? slot(1 - f.side, 'beast') : f.target === 'direct' ? null : slot(1 - f.side, f.target); lunge(a, t ? t.home : center(1 - f.side).add(new T.Vector3(0, 0, f.side ? 2 : -2))); break; }
      case 'hit': if (s) { flash(s); burst(top(s).setY(0.7 * s.scale), col || 0xffffff, 18, 3.4 * s.scale); shake = Math.max(shake, 0.18); const h = s.home; s.busy = true; tween(280, (k) => { s.obj.position.x = h.x + Math.sin(k * 28) * 0.1 * (1 - k) * s.scale; }, () => { s.busy = false; s.obj.position.copy(s.home); }); if (f.n) FX.num(top(s), '-' + f.n, 'bad'); } break;
      case 'lp': { shake = Math.max(shake, 0.3); const e = host.querySelector(`#bs${f.side} .lp`); if (e && f.n) { const [x, y] = stagePos(e, 0.5, 0.2); FX.num([x, y], '-' + f.n, 'bad big'); } break; }
      case 'heal': if (s) { ring(s.home, 0x6fd67a, 0.6 * s.scale); burst(top(s), 0x6fd67a, 8, 1.2, true); } else if (f.lp) { const e = host.querySelector(`#bs${f.side} .lp`); if (e) { const [x, y] = stagePos(e, 0.5, 0.2); FX.num([x, y], '회복', 'good'); } } break;
      case 'buff': case 'levelup': if (s) { ring(s.home, 0xf2c94c, 0.6 * s.scale); burst(top(s), 0xf2c94c, 8, 1.2, true); } break;
      case 'debuff': case 'status': if (s) { ring(s.home, 0xa060e0, 0.6 * s.scale); burst(top(s), 0xa060e0, 8, 1.2, true); } break;
      case 'capsule': if (s && s.model) { flash(s); tween(500, (k) => s.hold.scale.setScalar(1 - 0.7 * Math.sin(k * Math.PI))); ring(s.home, 0xff6060, 0.5 * s.scale); } break;
      case 'destroy': shake = Math.max(shake, 0.12); break;
    }
  };

  function frame(dt) {
    clock += dt / 1000;
    const ds = dt / 1000;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { tweens.splice(i, 1); if (t.done) t.done(); } }
    for (const k in slots) {
      const s = slots[k];
      if (!s.model || s.down) continue;
      const w = Math.sin(clock * 2.2 + s.phase);
      s.model.position.y = (0.03 + 0.03 * w) * s.base;
      s.model.rotation.y = Math.sin(clock * 0.9 + s.phase) * 0.12;
      for (const wg of s.model.userData.wings) wg.rotation.z = -wg.userData.d * (0.75 + 0.35 * Math.sin(clock * 7 + s.phase));
    }
    for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d.t += dt; const k = Math.min(1, d.t / 320); d.obj.scale.multiplyScalar(1 - k * 0.35); d.obj.rotation.y += 0.4; d.obj.position.y += ds * 2; if (k >= 1) { scene.remove(d.obj); dying.splice(i, 1); } }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= ds; p.v.y -= p.g * ds; p.m.position.addScaledVector(p.v, ds); p.m.scale.multiplyScalar(0.96); if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
    cam.position.copy(camBase);
    cam.position.x += Math.sin(clock * 0.35) * 0.1;
    if (shake > 0.002) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; shake *= 0.86; }
    cam.lookAt(camLook);
    R.render(scene, cam);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
