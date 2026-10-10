import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL ?? '/';

export const SOUND_FILES = [
  'swing_light', 'swing_heavy', 'hit_flesh', 'hit_flesh_heavy', 'block_light', 'block_heavy', 'guard_break',
  'step_sand_0', 'step_sand_1', 'step_sand_2', 'step_lion_0', 'step_lion_1', 'dodge_roll', 'stamina_denied',
  'lion_roar', 'lion_roar2', 'lion_growl', 'lion_hurt', 'lion_death', 'lion_land', 'lion_wall', 'lion_bite',
  'lion_swipe', 'lion_warn', 'lion_pant', 'player_hurt', 'player_death', 'heal_drink', 'gate_rise', 'gate_drop',
  'crowd_loop', 'crowd_cheer', 'crowd_gasp', 'ui_click', 'ui_hover', 'music_calm', 'music_battle', 'music_phase2',
  'sting_victory', 'sting_defeat', 'lion_rise', 'lion_quake', 'lion_whirl', 'lion_dash', 'lion_hop', 'parry_ring', 'impact_boom', 'slowmo_whoosh',
] as const;
export type SoundName = (typeof SOUND_FILES)[number];

export interface Volumes { master: number; sfx: number; music: number }

export interface PlayOpts {
  volume?: number;
  rate?: number;
  pos?: { x: number; y: number; z: number };
  bus?: 'sfx' | 'music' | 'crowd';
  reverb?: number;
  /** 같은 키로 재생 중인 소리가 있으면 먼저 멈춘다 */
  key?: string;
  /** 짧은 지연 (초) */
  delay?: number;
}

/**
 * WebAudio 엔진. 브라우저 정책상 AudioContext 는 사용자 입력 이후 resume() 된다.
 * 모든 일회성 소리는 추적하여 재도전/종료 시 stopAll() 로 정리한다.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private crowdBus!: GainNode;
  private crowdFilter!: BiquadFilterNode;
  private reverbArena!: ConvolverNode;
  private reverbTunnel!: ConvolverNode;
  private arenaSend!: GainNode;
  private tunnelSend!: GainNode;
  private comp!: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private active = new Set<AudioScheduledSourceNode>();
  private keyed = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private musicDuck = 1;
  private crowdLevel = 0.4;
  volumes: Volumes = { master: 0.8, sfx: 0.9, music: 0.6 };
  available = true;
  failed: string[] = [];
  private tunnelMix = 0;
  currentMusic: string | null = null;

  constructor() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    } catch {
      this.available = false;
    }
  }

  private build() {
    const c = this.ctx!;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.crowdBus = c.createGain();
    this.crowdFilter = c.createBiquadFilter();
    this.crowdFilter.type = 'lowpass';
    this.crowdFilter.frequency.value = 18000;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.crowdBus.connect(this.crowdFilter).connect(this.master);
    this.reverbArena = c.createConvolver();
    this.reverbTunnel = c.createConvolver();
    this.reverbArena.buffer = this.makeIR(2.0, 0.045, 1.0, true);
    this.reverbTunnel.buffer = this.makeIR(1.1, 0.012, 0.9, false);
    this.arenaSend = c.createGain();
    this.tunnelSend = c.createGain();
    this.arenaSend.gain.value = 0.28;
    this.tunnelSend.gain.value = 0;
    const rv = c.createGain();
    rv.gain.value = 0.9;
    this.arenaSend.connect(this.reverbArena);
    this.tunnelSend.connect(this.reverbTunnel);
    this.reverbArena.connect(rv);
    this.reverbTunnel.connect(rv);
    rv.connect(this.master);
    this.applyVolumes();
  }

  /** 합성 임펄스 응답: 열린 아레나(스탠드 반향) vs 좁은 터널 */
  private makeIR(dur: number, predelay: number, dens: number, echoes: boolean): AudioBuffer {
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const pd = Math.floor(predelay * c.sampleRate);
      let lp = 0;
      for (let i = pd; i < n; i++) {
        const t = (i - pd) / c.sampleRate;
        const env = Math.exp(-t * (echoes ? 2.4 : 4.2));
        lp += (Math.random() * 2 - 1 - lp) * (echoes ? 0.35 : 0.6);
        d[i] = lp * env * dens;
      }
      if (echoes) {
        for (const [dt, a] of [[0.16, 0.5], [0.31, 0.35], [0.47, 0.22]]) {
          const k = Math.floor((dt + ch * 0.013) * c.sampleRate);
          for (let j = 0; j < 400; j++) if (k + j < n) d[k + j] += (Math.random() * 2 - 1) * a * (1 - j / 400);
        }
      }
    }
    return buf;
  }

  setVolumes(v: Volumes) {
    this.volumes = { ...v };
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * this.musicDuck, t, 0.05);
    this.crowdBus.gain.setTargetAtTime(this.volumes.sfx * this.crowdLevel, t, 0.1);
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* 사용자 입력이 아직 없음 */ }
    }
  }

  /** 모든 오디오 파일을 가져와 디코딩. 진행률 콜백 제공. */
  async loadAll(onProgress: (loaded: number, total: number, name: string) => void): Promise<void> {
    if (!this.ctx) return;
    const total = SOUND_FILES.length;
    let done = 0;
    await Promise.all(SOUND_FILES.map(async (name) => {
      try {
        const res = await fetch(`${BASE}assets/audio/${name}.ogg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        const buf = await this.ctx!.decodeAudioData(ab);
        this.buffers.set(name, buf);
      } catch (e) {
        this.failed.push(`${name}: ${e instanceof Error ? e.message : e}`);
      }
      done++;
      onProgress(done, total, name);
    }));
  }

  has(name: string) { return this.buffers.has(name); }

  play(name: SoundName, o: PlayOpts = {}): AudioBufferSourceNode | null {
    const c = this.ctx;
    const buf = this.buffers.get(name);
    if (!c || !buf || c.state !== 'running') return null;
    if (o.key) this.stopKey(o.key);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const g = c.createGain();
    g.gain.value = o.volume ?? 1;
    let node: AudioNode = g;
    src.connect(g);
    if (o.pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3.5;
      p.rolloffFactor = 1.1;
      p.maxDistance = 80;
      p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z;
      g.connect(p);
      node = p;
    }
    const bus = o.bus === 'music' ? this.musicBus : o.bus === 'crowd' ? this.crowdBus : this.sfxBus;
    node.connect(bus);
    const rev = o.reverb ?? 0.35;
    if (rev > 0 && o.bus !== 'music') {
      const send = c.createGain();
      send.gain.value = rev;
      node.connect(send);
      send.connect(this.arenaSend);
      send.connect(this.tunnelSend);
    }
    const when = c.currentTime + (o.delay ?? 0);
    src.start(when);
    this.active.add(src);
    src.onended = () => {
      this.active.delete(src);
      try { g.disconnect(); node.disconnect(); } catch { /* 이미 해제 */ }
      if (o.key && this.keyed.get(o.key)?.src === src) this.keyed.delete(o.key);
    };
    if (o.key) this.keyed.set(o.key, { src, gain: g });
    return src;
  }

  stopKey(key: string, fade = 0.05) {
    const k = this.keyed.get(key);
    if (!k || !this.ctx) return;
    const t = this.ctx.currentTime;
    k.gain.gain.cancelScheduledValues(t);
    k.gain.gain.setTargetAtTime(0, t, fade / 3);
    try { k.src.stop(t + fade * 2); } catch { /* 이미 정지 */ }
    this.keyed.delete(key);
  }

  /** 루프 재생 (군중/음악). 같은 이름이면 유지. */
  startLoop(name: SoundName, bus: 'music' | 'crowd', volume: number, fade = 1.2) {
    const c = this.ctx;
    const buf = this.buffers.get(name);
    if (!c || !buf) return;
    if (this.loops.has(name)) { this.setLoopVolume(name, volume, fade); return; }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(g).connect(bus === 'music' ? this.musicBus : this.crowdBus);
    src.start(0);
    g.gain.setTargetAtTime(volume, c.currentTime, fade / 3);
    this.loops.set(name, { src, gain: g });
  }
  setLoopVolume(name: string, volume: number, fade = 0.6) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    l.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, fade / 3);
  }
  stopLoop(name: string, fade = 1.0) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(0, t, fade / 3);
    try { l.src.stop(t + fade * 1.5); } catch { /* ok */ }
    this.loops.delete(name);
  }

  /** 음악 트랙 교체 (크로스페이드) */
  setMusic(track: 'music_calm' | 'music_battle' | 'music_phase2' | null, volume = 1, fade = 1.6) {
    if (track === this.currentMusic) { if (track) this.setLoopVolume(track, volume, fade); return; }
    for (const n of ['music_calm', 'music_battle', 'music_phase2']) if (n !== track) this.stopLoop(n, fade);
    if (track) this.startLoop(track, 'music', volume, fade);
    this.currentMusic = track;
  }

  /** 공격 예고음 등이 묻히지 않도록 음악/군중을 잠시 낮춘다 */
  duck(amount: number, dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicDuck = 1 - amount;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * (1 - amount), t, 0.04);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t + dur, 0.4);
    this.musicDuck = 1;
  }

  setCrowdLevel(level: number) {
    this.crowdLevel = level;
    if (!this.ctx) return;
    this.crowdBus.gain.setTargetAtTime(this.volumes.sfx * level, this.ctx.currentTime, 0.25);
  }

  /** 청취자 위치/방향 + 터널 여부로 잔향 혼합 */
  updateListener(cam: THREE.Camera, inTunnel: number) {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    const p = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = c.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    }
    this.tunnelMix += (inTunnel - this.tunnelMix) * 0.08;
    this.tunnelSend.gain.setTargetAtTime(0.5 * this.tunnelMix, t, 0.1);
    this.arenaSend.gain.setTargetAtTime(0.3 * (1 - this.tunnelMix * 0.7), t, 0.1);
    // 터널 안에서는 군중이 먹먹하게 들린다
    this.crowdFilter.frequency.setTargetAtTime(18000 - 15500 * this.tunnelMix, t, 0.15);
  }

  /** 재시작/종료: 일회성 소리를 모두 정리 */
  stopAllOneShots() {
    for (const s of [...this.active]) {
      try { s.stop(); } catch { /* 이미 정지 */ }
    }
    this.active.clear();
    this.keyed.clear();
  }

  activeCount() { return this.active.size + this.loops.size; }

  dispose() {
    this.stopAllOneShots();
    for (const n of [...this.loops.keys()]) this.stopLoop(n, 0.1);
    this.ctx?.close();
  }
}
