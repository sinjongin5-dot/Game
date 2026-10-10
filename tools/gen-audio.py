#!/usr/bin/env python3
"""절차적 오디오 합성 (numpy/scipy). 모든 소리는 이 스크립트가 직접 합성한 원본이다.
실행: python3 tools/gen-audio.py  → public/assets/audio/*.ogg
"""
import os, subprocess, sys
import numpy as np
from scipy import signal

SR = 44100
OUT = 'public/assets/audio'
TMP = '.tmp/audio'
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(20260610)

def t_(dur): return np.arange(int(SR * dur)) / SR
def noise(n): return rng.standard_normal(n)
def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak
def env_ad(n, a, d, power=2.0):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
    return e
def bp(x, lo, hi, order=2):
    nyq = SR / 2
    lo = max(20, lo); hi = min(nyq * 0.98, hi)
    sos = signal.butter(order, [lo / nyq, hi / nyq], btype='band', output='sos')
    return signal.sosfilt(sos, x)
def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.49) / (SR / 2), btype='low', output='sos')
    return signal.sosfilt(sos, x)
def hp(x, fc, order=2):
    sos = signal.butter(order, max(fc, 20) / (SR / 2), btype='high', output='sos')
    return signal.sosfilt(sos, x)
def sweep_bp(x, f0, f1, q=3.0, block=512):
    """시간에 따라 중심주파수가 변하는 밴드패스 (블록 처리)"""
    out = np.zeros_like(x)
    n = len(x)
    for s in range(0, n, block):
        e = min(n, s + block)
        f = f0 + (f1 - f0) * (s / n)
        out[s:e] = bp(x[max(0, s - block):e], f / (1 + 1 / q), f * (1 + 1 / q))[-(e - s):]
    return out
def fade(x, a=0.004, b=0.01):
    n = len(x); fa = int(a * SR); fb = int(b * SR)
    if fa: x[:fa] *= np.linspace(0, 1, fa)
    if fb: x[-fb:] *= np.linspace(1, 0, fb)
    return x
def tanh_sat(x, g): return np.tanh(x * g) / np.tanh(g)
def formant(x, f, bw, order=2):
    return bp(x, f - bw / 2, f + bw / 2, order)

def save(name, x, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    x = norm(x, peak)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    wav = f'{TMP}/{name}.wav'
    import wave
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', f'{OUT}/{name}.ogg'], check=True)
    print('wrote', name, f'{len(x)/SR:.2f}s', os.path.getsize(f'{OUT}/{name}.ogg') // 1024, 'KB')

# ── 검 휘두르기 ─────────────────────────────────────────────────────────────
def swing(dur, f0, f1, level):
    n = int(SR * dur); t = np.arange(n) / SR
    x = sweep_bp(noise(n), f0, f1, q=1.6)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.2
    return fade(x * e * level)
save('swing_light', swing(0.3, 900, 3600, 1.0), 0.7)
save('swing_heavy', swing(0.5, 350, 2400, 1.0) + 0.5 * lp(noise(int(SR * 0.5)), 500) * np.sin(np.pi * np.clip(t_(0.5) / 0.5, 0, 1)) ** 2, 0.8)

# ── 타격음 ───────────────────────────────────────────────────────────────────
def thump(dur, f0, f1, decay):
    t = t_(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / decay)
def flesh(dur, power):
    n = int(SR * dur)
    th = thump(dur, 150, 48, 0.09 * power)
    crack = bp(noise(n), 500, 3200) * env_ad(n, 0.002, 0.03 * power) * 0.9
    slap = lp(noise(n), 900) * env_ad(n, 0.003, 0.08 * power) * 0.8
    return fade(th * 1.0 + crack + slap)
save('hit_flesh', flesh(0.4, 1.0), 0.9)
save('hit_flesh_heavy', flesh(0.6, 1.8) * 1.2 + 0.5 * thump(0.6, 90, 36, 0.25), 0.95)

def clang(dur, base, level):
    n = int(SR * dur); t = np.arange(n) / SR
    partials = [(1.0, 1.0, 0.18), (2.76, 0.7, 0.12), (5.4, 0.45, 0.08), (8.93, 0.3, 0.05), (1.5, 0.5, 0.2)]
    x = np.zeros(n)
    for r, a, d in partials:
        x += a * np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6)) * np.exp(-t / (d * dur * 2))
    click = hp(noise(n), 2500) * env_ad(n, 0.0005, 0.012)
    body = thump(dur, 160, 55, 0.12)
    return fade(x * 0.45 + click * 0.8 + body * 1.2) * level
save('block_light', clang(0.55, 520, 1.0), 0.85)
save('block_heavy', clang(0.9, 310, 1.0) + 0.6 * thump(0.9, 80, 32, 0.3), 0.95)
n = int(SR * 1.1)
gb = clang(1.1, 260, 1.0) + 0.7 * thump(1.1, 70, 30, 0.4) + 0.5 * sweep_bp(noise(n), 4000, 900, 1.0) * env_ad(n, 0.01, 0.25)
crack = hp(noise(n), 1800) * env_ad(n, 0.001, 0.02) * 1.3
save('guard_break', gb + crack, 0.95)

# ── 발소리/구르기 ───────────────────────────────────────────────────────────
for i in range(3):
    n = int(SR * 0.2)
    x = bp(noise(n), 700 + 300 * i, 3500) * env_ad(n, 0.003, 0.05) + 0.6 * thump(0.2, 120, 60, 0.04)
    save(f'step_sand_{i}', fade(x), 0.55)
for i in range(2):
    n = int(SR * 0.35)
    x = thump(0.35, 85 - 10 * i, 38, 0.1) * 1.3 + lp(noise(n), 1100 - 200 * i) * env_ad(n, 0.004, 0.08) * 0.8
    save(f'step_lion_{i}', fade(x), 0.85)
n = int(SR * 0.7)
roll = bp(noise(n), 300, 2600) * (np.exp(-((t_(0.7) - 0.12) / 0.07) ** 2) * 0.8 + np.exp(-((t_(0.7) - 0.42) / 0.09) ** 2) * 1.0)
roll += thump(0.7, 110, 45, 0.07) * np.exp(-((t_(0.7) - 0.42) / 0.12) ** 2) * 1.2
save('dodge_roll', fade(roll), 0.8)
n = int(SR * 0.22)
save('stamina_denied', fade(thump(0.22, 220, 110, 0.05) * 0.8 + lp(noise(n), 800) * env_ad(n, 0.002, 0.04) * 0.4), 0.5)

# ── 사자 ─────────────────────────────────────────────────────────────────────
def glottal(n, f0_curve, jitter=0.03, harmonics=40):
    """성대 펄스열 (톱니+하모닉 감쇠), f0_curve: 길이 n의 주파수 배열"""
    f = f0_curve * (1 + jitter * lp(noise(n), 40, 1) * 6)
    ph = np.cumsum(f) / SR
    x = np.zeros(n)
    for h in range(1, harmonics):
        x += np.sin(2 * np.pi * ph * h) / (h ** 1.15)
    return x
def vowel(x, f1, f2, f3, bw=(110, 160, 240), blend=1.0):
    return formant(x, f1, bw[0] * 2) * 1.0 + formant(x, f2, bw[1] * 2) * 0.55 + formant(x, f3, bw[2] * 2) * 0.28
def roar(dur, f0a, f0b, intensity, rumble_hz=24):
    n = int(SR * dur); t = np.arange(n) / SR; u = t / dur
    f0 = f0a + (f0b - f0a) * (np.sin(np.pi * np.clip(u * 1.1, 0, 1)) * 0.5 + u * 0.5) + 8 * np.sin(2 * np.pi * 0.7 * t)
    src = glottal(n, f0, jitter=0.05)
    # 가르랑거림 진폭 변조 (롤링)
    am = 0.55 + 0.45 * np.sin(2 * np.pi * (rumble_hz + 6 * np.sin(2 * np.pi * 0.9 * t)) * t) ** 2
    src = src * am
    breath = noise(n)
    # 모음 이동: 아 → 오
    out = np.zeros(n)
    steps = 12
    for s in range(steps):
        a = s * n // steps; b = (s + 1) * n // steps
        k = s / (steps - 1)
        f1 = 750 - 260 * k; f2 = 1250 - 480 * k; f3 = 2500 - 150 * k
        seg = src[max(0, a - 800):b]
        v = vowel(seg, f1, f2, f3)[-(b - a):]
        br = bp(breath[max(0, a - 800):b], 900, 4200)[-(b - a):] * 0.35
        out[a:b] = v + br
    out = tanh_sat(out / (np.max(np.abs(out)) + 1e-9), 3.2 * intensity)
    env = np.minimum(1, t / 0.14) ** 1.5 * np.minimum(1, (dur - t) / (dur * 0.35)) ** 1.5
    low = lp(src, 220) * 0.6
    return fade((out + low) * env * 1.0, 0.01, 0.05)
save('lion_roar', roar(2.4, 78, 62, 1.0), 0.95)
save('lion_roar2', roar(2.4, 94, 70, 1.35, 28), 0.95)
save('lion_growl', roar(1.3, 58, 52, 0.7, 20) * 0.9, 0.8)
save('lion_hurt', roar(0.7, 120, 80, 0.9, 30), 0.85)
n = int(SR * 3.2); t = t_(3.2)
f0 = 90 * np.exp(-t * 0.55)
dsrc = glottal(n, f0, jitter=0.06, harmonics=24) * (0.6 + 0.4 * np.sin(2 * np.pi * 16 * t) ** 2)
dv = vowel(dsrc, 520, 880, 2400) + 0.2 * bp(noise(n), 700, 3000)
dv = tanh_sat(dv / (np.max(np.abs(dv)) + 1e-9), 2.0) * np.exp(-t / 1.1) * np.minimum(1, t / 0.1)
save('lion_death', fade(dv, 0.01, 0.2), 0.8)
n = int(SR * 0.9)
land = thump(0.9, 100, 28, 0.35) * 1.4 + lp(noise(n), 400) * env_ad(n, 0.004, 0.18) * 0.9 + bp(noise(n), 900, 3500) * env_ad(n, 0.002, 0.07) * 0.5
save('lion_land', fade(land), 0.95)
n = int(SR * 1.6)
wall = thump(1.6, 70, 24, 0.5) * 1.5 + lp(noise(n), 700) * env_ad(n, 0.003, 0.4) * 1.0
for k in range(14):
    p0 = 0.06 + rng.uniform(0, 1.2)
    wall += 0.6 * hp(noise(n), 1500) * np.exp(-((t_(1.6) - p0) / 0.012) ** 2) * rng.uniform(0.2, 0.8)
save('lion_wall', fade(wall), 0.95)
n = int(SR * 0.32)
bite = hp(noise(n), 1800) * env_ad(n, 0.001, 0.015) * 1.2 + thump(0.32, 190, 70, 0.05) * 0.9 + bp(noise(n), 300, 1800) * env_ad(n, 0.004, 0.07) * 0.8
save('lion_bite', fade(bite), 0.9)
n = int(SR * 0.45)
sw = sweep_bp(noise(n), 300, 1400, q=1.3) * np.sin(np.pi * np.clip(t_(0.45) / 0.45, 0, 1)) ** 1.8 + hp(noise(n), 3500) * env_ad(n, 0.18, 0.05) * 0.3
save('lion_swipe', fade(sw), 0.85)
# 으르렁 (공격 예고, 짧게)
save('lion_warn', roar(0.9, 72, 66, 0.8, 22) * 0.85, 0.8)
# 숨소리 (헐떡임)
n = int(SR * 0.8)
save('lion_pant', fade(bp(noise(n), 400, 2400) * (np.sin(2 * np.pi * 2.2 * t_(0.8)) ** 2) * 0.6), 0.4)

# ── 사람 ─────────────────────────────────────────────────────────────────────
def grunt(dur, f0, vow, level, bend=-0.25):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f0 * (1 + bend * t / dur)
    src = glottal(n, f, jitter=0.04, harmonics=30)
    x = vowel(src, *vow) + 0.25 * bp(noise(n), 600, 3500)
    return fade(x * env_ad(n, 0.02, dur * 0.35) * level, 0.005, 0.03)
save('player_hurt', grunt(0.5, 118, (620, 1040, 2500), 1.0), 0.8)
n = int(SR * 2.0)
dd = np.zeros(n)
g = grunt(0.7, 105, (540, 900, 2400), 1.0)
dd[:len(g)] += g
dd += thump(2.0, 85, 35, 0.22) * np.exp(-((t_(2.0) - 0.75) / 0.18) ** 2) * 1.6
for k in range(9):
    p0 = 0.7 + rng.uniform(0, 0.9)
    dd += hp(noise(n), 2200) * np.exp(-((t_(2.0) - p0) / 0.015) ** 2) * rng.uniform(0.15, 0.45)
save('player_death', fade(dd), 0.9)
n = int(SR * 1.1)
dr = np.zeros(n)
for k, p0 in enumerate([0.15, 0.4, 0.62]):
    seg = bp(noise(n), 200, 900) * np.exp(-((t_(1.1) - p0) / 0.07) ** 2)
    dr += seg * (1.0 - 0.15 * k)
dr += lp(noise(n), 500) * 0.15 * env_ad(n, 0.05, 0.3)
save('heal_drink', fade(dr), 0.7)

# ── 문 ───────────────────────────────────────────────────────────────────────
n = int(SR * 3.4); t = t_(3.4)
gr = lp(noise(n), 260) * 0.8 * np.minimum(1, t / 0.4) * np.minimum(1, (3.4 - t) / 0.5)
for k in range(46):
    p0 = rng.uniform(0.1, 3.2)
    gr += 0.35 * bp(noise(n), 1500, 6000) * np.exp(-((t - p0) / 0.01) ** 2) * rng.uniform(0.3, 1.0)
gr += 0.4 * sweep_bp(noise(n), 700, 500, 2.0) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t))
save('gate_rise', fade(gr, 0.05, 0.3), 0.8)
n = int(SR * 1.3); t = t_(1.3)
gd = 0.45 * bp(noise(n), 1500, 6000) * env_ad(n, 0.01, 0.2) + clang(1.3, 190, 1.0) * np.exp(-((t - 0.38) / 0.4) ** 2) + thump(1.3, 80, 28, 0.3) * np.exp(-((t - 0.38) / 0.3) ** 2) * 1.6
gd[:int(SR * 0.3)] *= np.linspace(0.3, 1, int(SR * 0.3))
save('gate_drop', fade(gd), 0.95)

# ── 관중 ─────────────────────────────────────────────────────────────────────
def crowd_bed(dur, level, voices=60, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * dur); t = np.arange(n) / SR
    base = lp(r.standard_normal(n), 900) * 0.6
    base += bp(r.standard_normal(n), 300, 1800) * 0.5
    # 말소리 같은 변조
    am = 0.6 + 0.4 * lp(r.standard_normal(n), 3.0, 1) * 8
    x = base * np.clip(am, 0.2, 1.5)
    for v in range(voices):
        p0 = r.uniform(0, dur); d = r.uniform(0.15, 0.7); f = r.uniform(180, 420)
        seg_n = int(d * SR)
        s = glottal(seg_n, f * (1 + 0.2 * np.sin(2 * np.pi * r.uniform(2, 5) * np.arange(seg_n) / SR)), jitter=0.03, harmonics=18)
        s = vowel(s, r.uniform(450, 800), r.uniform(900, 1700), 2500) * np.hanning(seg_n)
        i0 = int(p0 * SR)
        e = min(n, i0 + seg_n)
        x[i0:e] += s[:e - i0] * r.uniform(0.03, 0.12)
    return x * level
bed = crowd_bed(16, 1.0, 90, 3)
# 이음새 없는 루프: 앞뒤 크로스페이드
xf = int(1.5 * SR)
loop = bed.copy()
loop[:xf] = bed[:xf] * np.linspace(0, 1, xf) + bed[-xf:] * np.linspace(1, 0, xf)
loop = loop[:-xf]
save('crowd_loop', loop, 0.55)
n = int(SR * 4.2); t = t_(4.2)
ch = crowd_bed(4.2, 1.3, 120, 8) * (np.minimum(1, t / 0.6) ** 1.5) * np.exp(-np.maximum(t - 1.8, 0) / 1.2)
for k in range(5):
    p0 = rng.uniform(0.3, 2.5)
    ch += 0.12 * np.sin(2 * np.pi * (1800 + 300 * k) * np.cumsum(1 + 0.2 * np.sin(2 * np.pi * 6 * t)) / SR) * np.exp(-((t - p0) / 0.5) ** 2)
save('crowd_cheer', fade(ch, 0.05, 0.2), 0.85)
n = int(SR * 1.3); t = t_(1.3)
ga = crowd_bed(1.3, 1.0, 40, 11) * np.sin(np.pi * np.clip(t / 1.3, 0, 1)) ** 1.4
ga = sweep_bp(ga, 600, 1400, 1.2)
save('crowd_gasp', fade(ga, 0.05, 0.1), 0.7)

# ── UI ───────────────────────────────────────────────────────────────────────
save('ui_click', fade(thump(0.12, 440, 220, 0.025) * 0.7 + hp(noise(int(SR * 0.12)), 2500) * env_ad(int(SR * 0.12), 0.0008, 0.01) * 0.5), 0.6)
save('ui_hover', fade(hp(noise(int(SR * 0.06)), 3000) * env_ad(int(SR * 0.06), 0.001, 0.01) * 0.3), 0.3)

# ── 음악 ─────────────────────────────────────────────────────────────────────
def taiko(dur, f0=62, level=1.0, snap=0.5):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f0 * (1 + 1.2 * np.exp(-t * 35))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.28))
    head = bp(noise(n), 200, 1400) * np.exp(-t / 0.05) * snap
    return (body + head) * level
def brass(freq, dur, level=1.0, bright=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    x = np.zeros(n)
    for dt_ in (-0.004, 0.0, 0.005):
        ph = 2 * np.pi * freq * (1 + dt_) * t + 0.4 * np.sin(2 * np.pi * 5 * t) * 0.02
        x += signal.sawtooth(ph)
    x = lp(x, 500 + 1800 * bright) / 3
    env = np.minimum(1, t / 0.35) * np.minimum(1, (dur - t) / 0.45)
    return x * env * level
def mix_into(buf, x, at):
    i = int(at * SR)
    e = min(len(buf), i + len(x))
    if i < len(buf): buf[i:e] += x[:e - i]

def music(name, bpm, bars, drum_pattern, drone_notes, stabs, intensity):
    beat = 60.0 / bpm
    dur = bars * 4 * beat
    n = int(SR * dur)
    buf = np.zeros(n)
    # 드론 (낮은 현/금관 느낌)
    for fr in drone_notes:
        d = brass(fr, dur + 1.0, 0.55, 0.3 + 0.3 * intensity)
        d = d[:n] if len(d) >= n else np.pad(d, (0, n - len(d)))
        buf += d * 0.5
    # 타악
    for bar in range(bars):
        for step, (acc, pitch) in drum_pattern.items():
            at = (bar * 4 + step) * beat
            mix_into(buf, taiko(0.9, pitch, 0.9 * acc), at)
    # 금관 스탭
    for (at_beat, fr, d_beats, lvl) in stabs:
        mix_into(buf, brass(fr, d_beats * beat, lvl, 0.7 + intensity * 0.5), at_beat * beat)
    # 루프 접합 (꼬리를 앞에 합침)
    tail = int(1.2 * SR)
    ext = np.zeros(n + tail)
    ext[:n] = buf
    return ext, n, tail
def finish_music(name, ext, n, tail, peak=0.7):
    loop = ext[:n].copy()
    loop[:tail] += ext[n:n + tail]
    # 약한 공간감
    ir = np.exp(-np.arange(int(1.4 * SR)) / (0.35 * SR)) * noise(int(1.4 * SR))
    ir[:int(0.03 * SR)] = 0
    wet = signal.fftconvolve(loop, ir, mode='full')[:n]
    wet = wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(loop)) * 0.35
    out = loop + wet
    save(name, out, peak)
D2, A2, D3, F3, G2 = 73.4, 110.0, 146.8, 174.6, 98.0
ext, n, tail = music('music_calm', 62, 8, {0: (1.0, 55), 2: (0.45, 62), 3.5: (0.3, 70)}, [D2 * 0.5, A2 * 0.5 * 1.5], [(0, D3, 4, 0.5), (8, F3, 4, 0.45), (16, A2, 4, 0.5), (24, G2 * 2, 6, 0.45)], 0.2)
finish_music('music_calm', ext, n, tail, 0.55)
ext, n, tail = music('music_battle', 88, 8, {0: (1.0, 58), 1: (0.4, 70), 2: (0.7, 62), 3: (0.4, 74), 2.5: (0.35, 80)}, [D2, A2 * 0.75], [(0, D3, 1.5, 0.7), (4, F3, 1.5, 0.65), (8, D3 * 1.5, 1.5, 0.6), (12, F3, 2, 0.65), (16, D3, 1.5, 0.7), (20, A2, 1.5, 0.6), (24, G2 * 2, 1.5, 0.6), (28, F3, 3, 0.7)], 0.6)
finish_music('music_battle', ext, n, tail, 0.6)
ext, n, tail = music('music_phase2', 104, 8, {0: (1.0, 56), 0.5: (0.5, 64), 1: (0.5, 72), 1.5: (0.4, 80), 2: (0.9, 60), 2.5: (0.5, 68), 3: (0.6, 76), 3.5: (0.4, 84)}, [D2, A2 * 0.75, D3 * 0.5], [(0, D3, 1, 0.8), (2, F3, 1, 0.7), (4, D3 * 1.5, 1, 0.75), (6, F3 * 1.25, 1, 0.7), (8, D3, 1, 0.8), (10, A2, 1, 0.7), (12, G2 * 2, 1, 0.7), (14, F3, 1.5, 0.8), (16, D3, 1, 0.8), (18, F3, 1, 0.7), (20, D3 * 1.5, 1, 0.75), (22, F3 * 1.25, 1, 0.7), (24, D3, 1, 0.8), (26, A2 * 1.5, 1, 0.7), (28, G2 * 2, 1, 0.7), (30, D3, 2, 0.85)], 1.0)
finish_music('music_phase2', ext, n, tail, 0.65)
# 승리/패배 스팅
v = brass(D3 * 0.5, 4.0, 1.0, 0.5) + brass(A2, 4.0, 0.8, 0.5) + brass(F3, 4.0, 0.6, 0.7)
save('sting_victory', fade(v, 0.2, 0.8), 0.7)
d = taiko(2.0, 48, 1.0) * 1.2 + brass(D2, 3.0, 0.8, 0.2)[:int(SR * 2.0)] * 0.0
d = np.pad(d, (0, int(SR * 1.2)))
dd2 = brass(D2 * 0.75, 3.2, 0.9, 0.2)
dd2[:len(d)] += d[:len(dd2)]
save('sting_defeat', fade(dd2, 0.1, 0.6), 0.7)
print('done')
