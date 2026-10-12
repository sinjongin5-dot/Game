#!/usr/bin/env python3
"""전투 연출용 효과음 추가분(절차적 합성, numpy/scipy). 기존 gen-audio.py 의 결과물은 건드리지 않는다.
실행: python3 tools/gen-audio-combat.py  → public/assets/audio/*.ogg
실제 녹음이 아니라 합성음이라 질감은 단순하다 (README 제한 사항 참고).
"""
import os, subprocess, wave
import numpy as np
from scipy import signal

SR = 44100
OUT = 'public/assets/audio'
TMP = '.tmp/audio'
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(777001)

def t_(dur): return np.arange(int(SR * dur)) / SR
def noise(n): return rng.standard_normal(n)
def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak
def env_ad(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
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
    out = np.zeros_like(x); n = len(x)
    for s in range(0, n, block):
        e = min(n, s + block); f = f0 + (f1 - f0) * (s / n)
        out[s:e] = bp(x[max(0, s - block):e], f / (1 + 1 / q), f * (1 + 1 / q))[-(e - s):]
    return out
def fade(x, a=0.004, b=0.01):
    n = len(x); fa = int(a * SR); fb = int(b * SR)
    if fa: x[:fa] *= np.linspace(0, 1, fa)
    if fb: x[-fb:] *= np.linspace(1, 0, fb)
    return x
def save(name, x, peak=0.9):
    x = norm(np.asarray(x, dtype=np.float64), peak)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    wav = f'{TMP}/{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', f'{OUT}/{name}.ogg'], check=True)
    print('wrote', name, f'{len(x)/SR:.2f}s', os.path.getsize(f'{OUT}/{name}.ogg') // 1024, 'KB')

def swing(dur, f0, f1, level, q=1.6, skew=2.2):
    n = int(SR * dur); t = np.arange(n) / SR
    x = sweep_bp(noise(n), f0, f1, q=q)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** skew
    return fade(x * e * level)
def thump(dur, f0, f1, decay):
    t = t_(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
def flesh(dur, power, lo=500, hi=3200):
    n = int(SR * dur)
    th = thump(dur, 150, 48, 0.09 * power)
    crack = bp(noise(n), lo, hi) * env_ad(n, 0.002, 0.03 * power) * 0.9
    slap = lp(noise(n), 900) * env_ad(n, 0.003, 0.08 * power) * 0.8
    return fade(th + crack + slap)
def clang(dur, base, level, bright=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    partials = [(1.0, 1.0, 0.18), (2.76, 0.7, 0.12), (5.4, 0.45, 0.08), (8.93, 0.3, 0.05), (1.5, 0.5, 0.2)]
    x = np.zeros(n)
    for r, a, d in partials:
        x += a * np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6)) * np.exp(-t / (d * dur * 2))
    click = hp(noise(n), 2500) * env_ad(n, 0.0005, 0.012) * bright
    return fade(x * 0.45 + click * 0.8 + thump(dur, 160, 55, 0.12) * 1.0) * level

# ── 휘두름 변주: 같은 소리가 반복돼 기계적으로 들리지 않도록 서로 다른 3종 ──
save('swing_light_b', swing(0.28, 1100, 4300, 1.0, 1.4), 0.7)
save('swing_light_c', swing(0.33, 700, 3000, 1.0, 1.8, 1.8), 0.7)
# 달리기 공격: 더 길고 끌리는 바람 가르는 소리
n = int(SR * 0.5)
save('swing_run', swing(0.5, 500, 3400, 1.0, 1.3, 1.5) + 0.3 * lp(noise(n), 700) * np.sin(np.pi * np.clip(t_(0.5) / 0.5, 0, 1)) ** 2, 0.78)

# ── 타격 변주 ──
save('hit_flesh_b', flesh(0.36, 0.85, 400, 2800), 0.9)
save('hit_flesh_c', flesh(0.44, 1.15, 650, 3600) + 0.3 * thump(0.44, 110, 40, 0.1), 0.9)

# ── 패링: 날카로운 금속 충돌(밝고 짧음) — 기존 parry_ring(긴 울림)과 겹쳐 재생 ──
dur = 0.7; n = int(SR * dur); t = t_(dur)
pc = clang(dur, 1640, 1.0, 1.6) * 0.9
pc += hp(noise(n), 5000) * env_ad(n, 0.0003, 0.01) * 1.1
# 칼날이 미끄러지는 쇳소리 (짧은 상승 스크레이프)
scr = sweep_bp(noise(n), 3500, 7200, q=4.0) * env_ad(n, 0.003, 0.05) * 0.5
for k, f in enumerate([3800, 5200, 6900]):
    pc += 0.14 * np.sin(2 * np.pi * f * t) * np.exp(-t / (0.09 + 0.03 * k))
save('parry_clang', fade(pc + scr), 0.92)

# ── 자세 붕괴: 낮은 균열 + 하강음 + 차가운 반짝임 ──
dur = 1.3; n = int(SR * dur); t = t_(dur)
sb = thump(dur, 95, 28, 0.32) * 1.3
sb += np.sin(2 * np.pi * np.cumsum(700 * np.exp(-t * 3.2) + 90) / SR) * np.exp(-t / 0.35) * 0.35
sb += bp(noise(n), 800, 5500) * env_ad(n, 0.001, 0.05) * 0.9
shimmer = sum(0.07 * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / (0.3 + 0.1 * i)) for i, f in enumerate([2100, 3300, 4800, 6200]))
save('stagger_break', fade(sb + shimmer), 0.95)

# ── 처형: 예비 상승음 + 거대한 타격 ──
dur = 0.9; n = int(SR * dur); t = t_(dur)
ew = np.sin(2 * np.pi * np.cumsum(140 + 700 * (t / dur) ** 2.2) / SR) * np.minimum(1, t / 0.1) * (t / dur) ** 1.4 * 0.35
ew += hp(noise(n), 2500) * (t / dur) ** 2 * env_ad(n, 0.05, 0.6) * 0.25
save('execute_whoosh', fade(ew, 0.02, 0.04), 0.6)
dur = 1.8; n = int(SR * dur); t = t_(dur)
eh = thump(dur, 72, 22, 0.55) * 1.6 + flesh(dur, 2.2)[:n] * 1.1
eh += clang(dur, 230, 1.0, 0.5)[:n] * 0.5
eh += lp(noise(n), 260) * env_ad(n, 0.003, 0.3) * 0.9
save('execute_hit', fade(eh, 0.001, 0.2), 0.98)

# ── 지면 파쇄: 석재 균열 + 흩어지는 돌조각 ──
dur = 1.1; n = int(SR * dur)
gc = bp(noise(n), 300, 2400) * env_ad(n, 0.001, 0.07) * 1.0
gc += thump(dur, 80, 30, 0.2) * 0.9
rub = np.zeros(n)
for k in range(14):
    at = int(SR * (0.04 + rng.uniform(0, 0.8) ** 1.4)); L = int(SR * rng.uniform(0.01, 0.03))
    if at + L < n: rub[at:at + L] += hp(noise(L), rng.uniform(1500, 4000)) * np.hanning(L) * rng.uniform(0.2, 0.6)
save('ground_crack', fade(gc + rub), 0.9)

# ── 보스 공격 전조: 모래를 긁는 소리와 낮은 숨 ──
dur = 0.8; n = int(SR * dur); t = t_(dur)
lt = bp(noise(n), 350, 1700) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5 * 0.7
lt += lp(noise(n), 160) * np.sin(np.pi * np.clip(t / dur, 0, 1)) * 0.8
lt += thump(dur, 60, 40, 0.5) * 0.25
save('lion_tell', fade(lt, 0.03, 0.08), 0.6)
print('done')
