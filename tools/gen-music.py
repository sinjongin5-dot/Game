#!/usr/bin/env python3
"""보스전 음악 합성 (numpy/scipy). 모든 음은 이 스크립트가 직접 합성한 원본이다.
실행: python3 tools/gen-music.py  → public/assets/audio/music_battle.ogg, music_phase2.ogg (이음매 없는 루프)

설계 의도(긴장감):
  - 낮은 드론 + 반음(♭2) 충돌: D 위에 E♭ 을 겹쳐 불안정한 울림을 만든다.
  - 심장 박동 같은 큰북 + 구간이 갈수록 촘촘해지는 톰 롤.
  - 떨리는 현(트레몰로) 클러스터가 4마디마다 부풀었다 꺼진다 → 곧 공격이 올 것 같은 압박.
  - 합창 느낌의 포먼트 패드, 낮은 금관 스탭, 금속성 틱(째깍거림), 상승 노이즈(라이저).
  - 2페이즈 곡은 템포를 올리고 16분 큰북 오스티나토 + 8분 베이스 펄스로 몰아붙인다.
"""
import os, subprocess
import numpy as np
from scipy import signal

SR = 44100
OUT = 'public/assets/audio'
TMP = '.tmp/audio'
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(20261010)


def noise(n): return rng.standard_normal(n)
def bp(x, lo, hi, order=2):
    nyq = SR / 2
    lo = max(20, lo); hi = min(nyq * 0.98, hi)
    return signal.sosfilt(signal.butter(order, [lo / nyq, hi / nyq], btype='band', output='sos'), x)
def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.49) / (SR / 2), btype='low', output='sos'), x)
def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, max(fc, 20) / (SR / 2), btype='high', output='sos'), x)
def tsat(x, g): return np.tanh(x * g) / np.tanh(g)


def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
D, Eb, F, G, A, Bb, C, Db = 2, 3, 5, 7, 9, 10, 0, 1  # 반음 이름 (옥타브 별도)
def note(name, octave): return midi(12 * (octave + 1) + name)


def put(buf, x, at_s):
    i = int(at_s * SR)
    if i >= len(buf): return
    x = x.copy()
    r = min(len(x), int(0.002 * SR))
    x[:r] *= np.linspace(0, 1, r)  # 2ms 페이드인: 곡이 루프 이음매에서 딱 소리 나지 않게
    e = min(len(buf), i + len(x))
    buf[i:e] += x[:e - i]


# ── 악기 ───────────────────────────────────────────────────────────────────────
def taiko(dur=1.0, f0=60, level=1.0, snap=0.5):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f0 * (1 + 1.3 * np.exp(-t * 32))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.26))
    skin = bp(noise(n), 160, 1400) * np.exp(-t / 0.05) * snap
    sub = np.sin(2 * np.pi * f0 * 0.5 * t) * np.exp(-t / (dur * 0.4)) * 0.25
    return (body + skin + sub) * level


def tom(dur=0.45, f0=110, level=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f0 * (1 + 0.8 * np.exp(-t * 40))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) + bp(noise(n), 300, 2400) * np.exp(-t / 0.03) * 0.5) * level


def tick(level=1.0, bright=1.0):
    n = int(SR * 0.05); t = np.arange(n) / SR
    return hp(noise(n), 5500 - 1500 * (1 - bright)) * np.exp(-t / 0.008) * level


def metal(dur=0.9, base=420, level=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    x = np.zeros(n)
    for r, a in [(1.0, 1.0), (2.76, 0.7), (5.4, 0.5), (8.9, 0.35), (13.1, 0.2)]:
        x += a * np.sin(2 * np.pi * base * r * t + rng.uniform(0, 6)) * np.exp(-t / (0.22 + 0.05 * rng.uniform()))
    x += hp(noise(n), 3000) * np.exp(-t / 0.05) * 0.6
    return x * level * 0.35


def crash(dur=2.2, level=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    x = bp(noise(n), 2500, 11000) * np.exp(-t / 0.7) + hp(noise(n), 6000) * np.exp(-t / 0.2) * 0.8
    return x * level * 0.5


def drone(freq, dur, level=1.0, wob=0.0):
    n = int(SR * dur); t = np.arange(n) / SR
    x = np.zeros(n)
    for dt_ in (-0.0035, 0.0, 0.004):
        f = freq * (1 + dt_) * (1 + wob * np.sin(2 * np.pi * 0.11 * t))
        x += signal.sawtooth(2 * np.pi * np.cumsum(f) / SR)
    x = lp(x, 260 + 140 * (1 + np.sin(2 * np.pi * 0.07 * t)).mean()) / 3
    x += 0.8 * np.sin(2 * np.pi * freq * 0.5 * t)
    return x * level


def drone_loop(freq, n, level=1.0, wob=0.0, lfo_cycles=5):
    """루프 길이(n 샘플) 안에서 정확히 정수 주기를 갖는 드론: 이음매에서 위상이 이어진다."""
    tt = np.arange(2 * n) / SR
    T = n / SR
    x = np.zeros(2 * n)
    for dt_ in (-0.0035, 0.0, 0.004):
        f = round(freq * (1 + dt_) * T) / T  # 정수 주기로 보정
        lfo = np.sin(2 * np.pi * lfo_cycles / T * tt)
        x += signal.sawtooth(2 * np.pi * np.cumsum(f * (1 + wob * lfo)) / SR)
    x = lp(x, 300) / 3
    fsub = round(freq * 0.5 * T) / T
    x += 0.8 * np.sin(2 * np.pi * fsub * tt)
    return x[n:] * level


def strings(freqs, dur, level=1.0, trem=11.0, depth=0.55, bright=0.5):
    """트레몰로 현악 클러스터: 여러 음을 약하게 어긋난 음정으로 겹치고 빠르게 떨게 한다."""
    n = int(SR * dur); t = np.arange(n) / SR
    out = np.zeros(n)
    for fr in freqs:
        for dt_ in (-0.006, 0.0, 0.007):
            vib = 1 + 0.004 * np.sin(2 * np.pi * (5.2 + rng.uniform(-0.4, 0.4)) * t + rng.uniform(0, 6))
            out += signal.sawtooth(2 * np.pi * np.cumsum(fr * (1 + dt_) * vib) / SR + rng.uniform(0, 6)) * 0.33
    out = lp(out, 900 + 3200 * bright)
    am = 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * trem * t + 0.7)) ** 1.5
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4  # 부풀었다 꺼진다
    return out * am * env * level / max(1, len(freqs)) ** 0.5


def choir(freqs, dur, level=1.0, vow=(650, 1080, 2650)):
    n = int(SR * dur); t = np.arange(n) / SR
    src = np.zeros(n)
    for fr in freqs:
        for dt_ in (-0.005, 0.0, 0.006):
            vib = 1 + 0.006 * np.sin(2 * np.pi * (5.6 + rng.uniform(-0.5, 0.5)) * t + rng.uniform(0, 6))
            src += signal.sawtooth(2 * np.pi * np.cumsum(fr * (1 + dt_) * vib) / SR + rng.uniform(0, 6))
    x = bp(src, vow[0] - 90, vow[0] + 90) + 0.6 * bp(src, vow[1] - 130, vow[1] + 130) + 0.3 * bp(src, vow[2] - 200, vow[2] + 200)
    env = np.minimum(1, t / (dur * 0.35)) * np.minimum(1, (dur - t) / (dur * 0.4))
    return x * env * level / max(1, len(freqs)) ** 0.6


def brass_hit(freq, dur=1.2, level=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    x = np.zeros(n)
    for dt_ in (-0.004, 0.0, 0.005):
        x += signal.sawtooth(2 * np.pi * freq * (1 + dt_) * t)
    cutoff = 400 + 2600 * np.exp(-t / 0.18)
    y = np.zeros(n)
    blk = 256
    for s in range(0, n, blk):  # 시간에 따라 열렸다 닫히는 필터(빠~암)
        e = min(n, s + blk)
        y[s:e] = lp(x[max(0, s - blk):e], float(cutoff[s]), 1)[-(e - s):]
    env = np.minimum(1, t / 0.03) * np.exp(-t / (dur * 0.42))
    return tsat(y / 3, 2.0) * env * level


def riser(dur, f0=200, f1=2400, level=1.0):
    n = int(SR * dur); t = np.arange(n) / SR; u = t / dur
    x = np.zeros(n)
    blk = 1024
    nz = noise(n)
    for s in range(0, n, blk):
        e = min(n, s + blk)
        f = f0 * (f1 / f0) ** (s / n)
        x[s:e] = bp(nz[max(0, s - blk):e], f * 0.7, f * 1.4)[-(e - s):]
    ph = 2 * np.pi * np.cumsum(f0 * (f1 / f0) ** u) / SR
    x = x * 0.7 + np.sin(ph) * 0.2
    return x * u ** 2.2 * level


def pulse_bass(freq, dur=0.22, level=1.0, cutoff=900):
    n = int(SR * dur); t = np.arange(n) / SR
    x = signal.sawtooth(2 * np.pi * freq * t) + 0.5 * signal.square(2 * np.pi * freq * 0.5 * t)
    env = np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.5))
    c = cutoff * np.exp(-t / 0.08) + 180
    y = np.zeros(n)
    blk = 128
    for s in range(0, n, blk):
        e = min(n, s + blk)
        y[s:e] = lp(x[max(0, s - blk):e], float(c[s]), 1)[-(e - s):]
    return tsat(y, 1.6) * env * level


# ── 곡 구성 ────────────────────────────────────────────────────────────────────
def finish(name, buf, n, tail, peak=0.62, per=None):
    loop = buf[:n].copy()
    loop[:tail] += buf[n:n + tail]            # 꼬리를 앞에 접어 이음매 제거
    if per is not None: loop += per           # 정수 주기 지속음은 접지 않고 그대로 더한다
    seam = abs(loop[0] - loop[-1]); d = np.abs(np.diff(loop))
    print(f'  seam jump {seam:.4f} / 내부 최대 변화 {d.max():.4f} / 99.9% {np.percentile(d, 99.9):.4f}')
    ir = np.exp(-np.arange(int(1.8 * SR)) / (0.5 * SR)) * noise(int(1.8 * SR))
    ir[:int(0.02 * SR)] = 0
    wet = signal.fftconvolve(loop, ir, mode='full')[:n]
    wet = wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(loop)) * 0.42
    mix = loop + wet
    # 가벼운 컴프레션(소프트 리미터) 후 정규화
    mix = tsat(mix / (np.max(np.abs(mix)) + 1e-9), 1.5)
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * peak
    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    import wave
    wav = f'{TMP}/{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', f'{OUT}/{name}.ogg'], check=True)
    print('wrote', name, f'{n / SR:.1f}s', os.path.getsize(f'{OUT}/{name}.ogg') // 1024, 'KB')


def build_battle():
    bpm, bars = 92, 16
    beat = 60 / bpm; bar = 4 * beat; s16 = beat / 4
    n = int(SR * bars * bar)
    tail = int(2.4 * SR)
    buf = np.zeros(n + tail)
    total = bars * bar

    # 드론: D1 + D2 위에 E♭ 이 4마디 간격으로 떠올랐다 가라앉는다 (♭2 충돌)
    per = np.zeros(n)   # 이음매 없이 반복되는 지속음 층
    per += drone_loop(note(D, 1), n, 0.30, 0.003, 5)
    per += drone_loop(note(D, 2), n, 0.30, 0.002, 7)
    per += drone_loop(note(A, 2), n, 0.10, 0.002, 3)
    for ph in range(4):
        at = ph * 4 * bar + 2 * bar
        d = drone(note(Eb, 2), 2 * bar + 0.6, 0.55)
        d *= np.sin(np.pi * np.linspace(0, 1, len(d))) ** 1.4
        put(buf, d, at)

    # 현 트레몰로 클러스터: 4마디 프레이즈마다 화음이 바뀌며 점점 날카로워진다
    phrases = [
        [note(D, 3), note(F, 3), note(A, 3)],
        [note(Eb, 3), note(G, 3), note(Bb, 3), note(D, 4)],
        [note(D, 3), note(F, 3), note(A, 3), note(Db, 4)],
        [note(Eb, 3), note(6, 3), note(Bb, 3), note(D, 4)],
    ]
    for i, ch in enumerate(phrases):
        put(buf, strings(ch, 4 * bar + 0.8, 1.7 + 0.25 * i, trem=10.5 + i, depth=0.55, bright=0.35 + 0.18 * i), i * 4 * bar - 0.2 if i else 0)

    # 합창 패드: 2마디마다 짧게 솟는다
    for k in range(bars // 2):
        base = [note(D, 3), note(A, 3)] if k % 4 not in (1, 3) else [note(Eb, 3), note(Bb, 3)]
        if k % 4 == 3: base = base + [note(D, 4)]
        put(buf, choir(base, 2 * bar, 1.0 + 0.2 * (k % 4), vow=(600, 1000, 2500) if k % 2 == 0 else (460, 780, 2500)), k * 2 * bar)

    # 큰북/톰: 심장 박동 + 4마디 끝의 톰 롤
    for b in range(bars):
        ph = b % 4
        inten = 0.7 + 0.1 * ph
        put(buf, taiko(1.1, 56, 1.0 * inten, 0.5), b * bar)
        put(buf, taiko(0.9, 62, 0.45 * inten, 0.3), b * bar + 2 * s16)
        put(buf, taiko(1.0, 54, 0.8 * inten, 0.5), b * bar + 2 * beat)
        put(buf, taiko(0.8, 62, 0.38 * inten, 0.3), b * bar + 2 * beat + 2 * s16)
        if ph == 3:  # 프레이즈 끝: 톰 롤(상승)
            for j in range(8):
                put(buf, tom(0.4, 90 + 14 * j, 0.5 + 0.07 * j), b * bar + 2.5 * beat + j * (beat * 0.1875))
        if ph == 1:
            put(buf, tom(0.4, 100, 0.55), b * bar + 3 * beat + 2 * s16)
            put(buf, tom(0.4, 82, 0.6), b * bar + 3 * beat + 3 * s16)

    # 금속 틱(째깍): 8분음표, 프레이즈 후반일수록 크게
    for b in range(bars):
        lv = 0.1 + 0.05 * (b % 4)
        for j in range(8):
            put(buf, tick(lv * 1.6 * (1.4 if j % 4 == 0 else 1.0), 0.6 + 0.1 * (b % 4)), b * bar + j * beat / 2)

    # 낮은 금관 스탭: 프레이즈 첫 박 + 싱코페이션
    for ph in range(4):
        root = note(D, 2) if ph % 2 == 0 else note(Eb, 2)
        at = ph * 4 * bar
        put(buf, brass_hit(root * 2, 1.6, 0.95), at)
        put(buf, brass_hit(root * 3, 1.2, 0.5), at)
        put(buf, brass_hit(root * 2, 0.8, 0.7), at + 2 * bar + 1.5 * beat)
    # 금속 울림 + 심벌 + 라이저
    for ph in range(4):
        put(buf, metal(1.2, note(D, 4) if ph % 2 == 0 else note(Eb, 4), 0.45), ph * 4 * bar)
        put(buf, crash(2.4, 0.5), ph * 4 * bar)
        put(buf, riser(1.6 * beat * 2, 220, 2600, 0.55), ph * 4 * bar + 4 * bar - 1.6 * beat * 2)
    finish('music_battle', buf, n, tail, 0.6, per)


def build_phase2():
    bpm, bars = 128, 16
    beat = 60 / bpm; bar = 4 * beat; s16 = beat / 4
    n = int(SR * bars * bar)
    tail = int(2.2 * SR)
    buf = np.zeros(n + tail)
    total = bars * bar

    per = np.zeros(n)
    per += drone_loop(note(D, 1), n, 0.30, 0.004, 5)
    per += drone_loop(note(D, 2), n, 0.30, 0.003, 7)
    per += drone_loop(note(Eb, 2), n, 0.16, 0.0, 3)  # 항상 깔리는 반음 충돌

    # 8분음표 베이스 펄스: 마디마다 D 와 E♭/F 사이를 오간다
    prog = [D, D, Eb, D, D, F, Eb, D]
    for b in range(bars):
        root = note(prog[b % 8], 2)
        for j in range(8):
            acc = 1.0 if j % 4 == 0 else 0.55
            put(buf, pulse_bass(root, 0.22, 0.42 * acc, 700 + 500 * (b % 4) / 3), b * bar + j * beat / 2)

    # 16분 큰북 오스티나토 (악센트 패턴) + 마디 끝 필인
    pat = [1.0, 0.0, 0.35, 0.0, 0.7, 0.0, 0.35, 0.3, 0.9, 0.0, 0.35, 0.0, 0.7, 0.35, 0.5, 0.35]
    for b in range(bars):
        ph = b % 4
        for j, a in enumerate(pat):
            if a <= 0: continue
            lvl = a * (0.7 + 0.1 * ph)
            if a >= 0.9: put(buf, taiko(0.9, 56, lvl, 0.6), b * bar + j * s16)
            else: put(buf, tom(0.3, 120 if j % 2 else 98, lvl * 0.55), b * bar + j * s16)
        if ph == 3:
            for j in range(8):
                put(buf, tom(0.3, 80 + 18 * j, 0.55 + 0.06 * j), b * bar + 3 * beat + j * (beat / 8))

    # 현 + 합창: 더 높고 더 거칠게
    chords = [
        [note(D, 3), note(F, 3), note(A, 3), note(Eb, 4)],
        [note(Eb, 3), note(G, 3), note(Bb, 3), note(D, 4)],
        [note(D, 3), note(F, 3), note(Db, 4), note(A, 4)],
        [note(Eb, 3), note(6, 3), note(Bb, 3), note(D, 4), note(Eb, 4)],
    ]
    for i, ch in enumerate(chords):
        put(buf, strings(ch, 4 * bar + 0.6, 2.0, trem=13 + i, depth=0.6, bright=0.75), i * 4 * bar)
        put(buf, strings([f * 2 for f in ch[:3]], 4 * bar + 0.6, 1.1, trem=15, depth=0.5, bright=0.9), i * 4 * bar)
    for k in range(bars // 2):
        base = [note(D, 3), note(A, 3), note(D, 4)] if k % 2 == 0 else [note(Eb, 3), note(Bb, 3), note(Eb, 4)]
        put(buf, choir(base, 2 * bar, 1.4, vow=(700, 1100, 2600)), k * 2 * bar)

    # 금관 스탭: 1·3박 + 싱코페이션, 점점 거칠게
    for b in range(bars):
        root = note(D, 2) if b % 4 in (0, 1, 3) else note(Eb, 2)
        put(buf, brass_hit(root * 2, 0.9, 0.95), b * bar)
        put(buf, brass_hit(root * 3, 0.6, 0.5), b * bar)
        if b % 2 == 1:
            put(buf, brass_hit(root * 2, 0.5, 0.75), b * bar + 2.5 * beat)
    for ph in range(4):
        put(buf, crash(2.0, 0.6), ph * 4 * bar)
        put(buf, metal(1.0, note(D, 4), 0.5), ph * 4 * bar + 2 * bar)
        put(buf, riser(2.0 * beat * 2, 260, 3200, 0.6), ph * 4 * bar + 4 * bar - 4 * beat)
    for b in range(bars):
        for j in range(16):
            put(buf, tick(0.09 * (1.5 if j % 4 == 0 else 0.8), 0.9), b * bar + j * s16)
    finish('music_phase2', buf, n, tail, 0.64, per)


if __name__ == '__main__':
    build_battle()
    build_phase2()
    print('done')
