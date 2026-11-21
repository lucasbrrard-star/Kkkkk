"""Trilha, sound design e mixagem da prévia — tudo sintetizado aqui (sem samples de terceiros).

Uso: python3 tools/build_audio.py
Saídas em assets/audio/: voice_prev.wav, music_prev.wav, sfx_prev.wav, mix_prev_premaster.wav
"""
import json
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
DUR = 8.5
N = int(SR * DUR)
BPM = 113
BEAT = 60 / BPM
rng = np.random.default_rng(1234)
ROOT = 'assets/audio/'
EV = json.load(open('assets/events.json'))


# ------------------------------------------------------------------ utilidades
def t_axis(n):
    return np.arange(n) / SR


def stereo(x, pan=0.0):
    """pan -1 (esq) .. 1 (dir), lei de potência constante"""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def place(buf, clip, at):
    i = int(round(at * SR))
    if i >= len(buf):
        return
    if i < 0:
        clip = clip[-i:]
        i = 0
    n = min(len(clip), len(buf) - i)
    buf[i:i + n] += clip[:n]


def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR / 2 * 0.95), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR / 2 * 0.95)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def peq(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def sweep_filter(x, f_start, f_end, kind='low', block=512, curve=1.0):
    """filtro com corte variando no tempo (processamento em blocos com estado)"""
    out = np.zeros_like(x)
    nb = int(np.ceil(len(x) / block))
    zi = None
    for k in range(nb):
        u = (k / max(1, nb - 1)) ** curve
        fc = f_start * (f_end / f_start) ** u
        if kind == 'band':
            sos = signal.butter(2, [fc / 1.5, min(fc * 1.5, SR * 0.47)], 'band', fs=SR, output='sos')
        else:
            sos = signal.butter(2, min(fc, SR * 0.47), kind, fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:])
        seg = x[k * block:(k + 1) * block]
        y, zi = signal.sosfilt(sos, seg, axis=0, zi=zi)
        out[k * block:(k + 1) * block] = y
    return out


def env_exp(n, attack=0.005, decay=0.5):
    t = t_axis(n)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def env_ar(n, attack, release):
    t = t_axis(n)
    total = n / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.clip((total - t) / max(release, 1e-4), 0, 1)
    return a * r


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    w = noise(n)
    b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 4


def saw(freq, n, phase=0.0):
    t = t_axis(n)
    return signal.sawtooth(2 * np.pi * freq * t + phase)


def sine(freq, n, phase=0.0):
    t = t_axis(n)
    if np.ndim(freq):
        ph = 2 * np.pi * np.cumsum(freq) / SR
        return np.sin(ph + phase)
    return np.sin(2 * np.pi * freq * t + phase)


def make_ir(seconds=2.6, predelay=0.02, damp=6000, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    decay = np.exp(-t * 6.9 / seconds)
    ir = np.stack([r.standard_normal(n) * decay, r.standard_normal(n) * decay], axis=1)
    ir = lp(ir, damp)
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR_HALL = make_ir(3.2, 0.03, 5000, 7)
IR_ROOM = make_ir(1.1, 0.01, 7000, 9)


def reverb(x, ir, wet=0.3):
    if x.ndim == 1:
        x = stereo(x)
    y = np.stack([signal.fftconvolve(x[:, 0], ir[:, 0])[:len(x)], signal.fftconvolve(x[:, 1], ir[:, 1])[:len(x)]], axis=1)
    return x * (1 - wet) + y * wet


def db(x):
    return 10 ** (x / 20)


def note(n):
    """nome -> Hz, ex.: 'A2'"""
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    name, octv = n[:-1], int(n[-1])
    return 440 * 2 ** ((names[name] + (octv - 4) * 12) / 12)


# ------------------------------------------------------------------ voz
def build_voice():
    x, sr = sf.read(ROOT + 'narr_raw.wav')
    assert sr == SR
    # encurta a pausa após "você." (6,07 -> 6,24 s), com crossfade de 15 ms
    a, b = int(6.07 * SR), int(6.24 * SR)
    xf = int(0.015 * SR)
    fade = np.linspace(0, 1, xf)
    head = x[:a].copy()
    tail = x[b:].copy()
    head[-xf:] = head[-xf:] * (1 - fade) + tail[:xf] * fade
    x = np.concatenate([head, tail[xf:]])
    # corta antes de "mas" (fim de "científica," ~8,06 s)
    end = int(8.22 * SR)
    x = x[:end]
    fo = int(0.06 * SR)
    x[-fo:] *= np.linspace(1, 0, fo) ** 2
    # tratamento: HPF, corpo, presença, ar
    x = hp(x, 85, 2)
    x = peq(x, 220, 1.5, 0.8)
    x = peq(x, 3200, 2.5, 0.9)
    x = peq(x, 9000, 1.5, 0.7)
    x = lp(x, 14000, 4)
    # compressor simples (RMS, 3:1)
    env = np.sqrt(signal.lfilter([0.002], [1, -0.998], x ** 2) + 1e-9)
    lvl = 20 * np.log10(env + 1e-9)
    thr = -24
    gr = np.where(lvl > thr, (thr - lvl) * (1 - 1 / 3), 0)
    gr = signal.lfilter([0.01], [1, -0.99], gr)
    x = x * db(gr)
    x = x / np.max(np.abs(x)) * 0.8
    out = np.zeros(N)
    out[:len(x)] = x
    return out


# ------------------------------------------------------------------ música (113 BPM, Lá menor)
def pad_chord(notes, n, bright=0.0, detune=0.12):
    y = np.zeros(n)
    for nn in notes:
        f = note(nn)
        for k in range(5):
            d = (k - 2) * detune
            y += saw(f * 2 ** (d / 12), n, phase=rng.uniform(0, 6.28)) * 0.2
    dark = lp(y, 600 + 900 * bright, 2)
    return dark / max(1e-9, np.max(np.abs(dark)))


def build_music():
    mus = np.zeros((N, 2))
    # trechos (compassos de 4 tempos = 2,124 s)
    sections = [
        (0.0, 4.25, ['A2', 'E3', 'A3', 'B3', 'C4'], 0.0, 0.5),
        (4.25, 6.37, ['F2', 'C3', 'A3', 'E4'], 0.35, 0.36),
        (6.37, 8.5, ['C2', 'G2', 'E3', 'B3', 'D4', 'F#4'], 0.8, 0.5),
    ]
    for (t0, t1, chord, bright, gain) in sections:
        n = int((t1 - t0 + 0.6) * SR)
        p = pad_chord(chord, n, bright)
        e = env_ar(n, 0.35 if t0 == 0 else 0.08, 0.6)
        if t0 == 0:
            e *= np.clip(t_axis(n) / 0.15, 0, 1)
        sw = 1 + 0.25 * np.sin(2 * np.pi * 0.23 * t_axis(n))
        l = p * e * sw * gain
        r = np.roll(p, 240) * e * sw * gain
        place(mus, np.stack([l, r], axis=1), t0 - (0.0 if t0 == 0 else 0.05))
    # pulso em semicolcheias (sintetizador plucado), entra no compasso 2
    seq_notes = {
        0: ['A2', 'A2', 'E3', 'A2', 'C3', 'A2', 'E3', 'B2'],
        1: ['F2', 'F2', 'C3', 'F2', 'A2', 'F2', 'C3', 'E3'],
        2: ['C3', 'C3', 'G3', 'C3', 'E3', 'C3', 'G3', 'D3'],
    }
    step = BEAT / 4
    t = 2 * 4 * BEAT / 2  # início do compasso 2 (2,124 s)
    i = 0
    while t < DUR - 0.05:
        sec = 0 if t < 4.25 else 1 if t < 6.37 else 2
        nn = seq_notes[sec][i % 8]
        f = note(nn)
        n = int(0.22 * SR)
        y = (saw(f, n) + 0.5 * saw(f * 2.005, n)) * env_exp(n, 0.002, 0.07)
        cut = 700 if sec == 0 else 1500 if sec == 1 else 2600
        cut *= 1 + 0.6 * ((i % 4) == 0)
        y = lp(y, cut, 2)
        acc = 1.0 if i % 4 == 0 else 0.7
        vol = (0.07 if sec == 0 else 0.085 if sec == 1 else 0.1) * acc
        if sec == 0:
            vol *= np.clip((t - 2.124) / 1.5, 0.15, 1)
        pan = 0.35 * np.sin(i * 1.3)
        place(mus, stereo(y * vol, pan), t)
        t += step
        i += 1
    # sub
    for (t0, t1, root, gain) in [(2.124, 4.25, 'A1', 0.16), (4.25, 6.37, 'F1', 0.2), (6.37, 8.5, 'C2', 0.22)]:
        n = int((t1 - t0) * SR)
        y = sine(note(root), n) * env_ar(n, 0.04, 0.15) * gain
        y = np.tanh(y * 2.2) / 2.2
        place(mus, stereo(y), t0)
    # percussão: bumbo leve no compasso 3, ticks no 4
    for k in range(4):
        tt = 4.25 + k * BEAT
        n = int(0.4 * SR)
        f = 50 + 90 * np.exp(-t_axis(n) / 0.03)
        y = sine(f, n) * env_exp(n, 0.001, 0.18) * 0.32
        place(mus, stereo(y), tt)
    for k in range(16):
        tt = 6.37 + k * BEAT / 4
        if tt > DUR - 0.12:
            break
        n = int(0.05 * SR)
        y = hp(noise(n), 7000) * env_exp(n, 0.0005, 0.012) * (0.05 if k % 2 else 0.08)
        place(mus, stereo(y, 0.3 * (1 if k % 2 else -1)), tt)
    mus = reverb(mus, IR_HALL, 0.32)
    # abre espaço para a voz (inteligibilidade 1,5–3 kHz)
    mus = peq(mus, 2000, -4.5, 0.8)
    return mus


# ------------------------------------------------------------------ sound design
def impact(n_sec=2.0, f0=58, f1=32, body=0.8, crack=0.5, bright=6000):
    n = int(n_sec * SR)
    t = t_axis(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.12)
    sub = sine(f, n) * env_exp(n, 0.002, n_sec * 0.35) * body
    sub = np.tanh(sub * 1.8) / 1.8
    cr = lp(hp(noise(n), 900), bright) * env_exp(n, 0.0008, 0.04) * crack
    return sub + cr


def whoosh(n_sec, f_start, f_end, peak=0.6, gain=0.5, pan0=0.0, pan1=0.0):
    n = int(n_sec * SR)
    x = pink(n)
    y = sweep_filter(x, f_start, f_end, 'band', curve=1.0)
    t = t_axis(n) / n_sec
    e = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.5)
    y = y * e * gain / (np.max(np.abs(y)) + 1e-9)
    pans = pan0 + (pan1 - pan0) * t
    a = (pans + 1) * np.pi / 4
    return np.stack([y * np.cos(a), y * np.sin(a)], axis=1)


def riser(n_sec, f0=180, f1=1400, gain=0.35):
    n = int(n_sec * SR)
    t = t_axis(n) / n_sec
    f = f0 * (f1 / f0) ** (t ** 1.6)
    tone = (sine(f, n) + 0.4 * sine(f * 1.5, n) + 0.25 * sine(f * 2.01, n))
    nz = sweep_filter(pink(n), 300, 9000, 'band', curve=1.6)
    nz = nz / (np.max(np.abs(nz)) + 1e-9)
    e = t ** 2.2
    trem = 1 + 0.3 * np.sin(2 * np.pi * (4 + 18 * t ** 2) * t_axis(n))
    return (tone * 0.35 + nz * 0.8) * e * trem * gain


def blip(freq, n_sec=0.09, gain=0.2, decay=0.03):
    n = int(n_sec * SR)
    y = (sine(freq, n) + 0.3 * sine(freq * 2.01, n)) * env_exp(n, 0.001, decay)
    return y * gain


def click(gain=0.08, hi=5000):
    n = int(0.02 * SR)
    return bp(noise(n), hi * 0.6, hi * 1.6) * env_exp(n, 0.0003, 0.004) * gain


def shimmer(n_sec, base=1800, gain=0.12, seed=1):
    r = np.random.default_rng(seed)
    n = int(n_sec * SR)
    y = np.zeros(n)
    for k in range(40):
        st = r.uniform(0, n_sec * 0.8)
        f = base * r.choice([1, 1.25, 1.5, 2, 2.5, 3])
        g = blip(f, 0.25, r.uniform(0.2, 1), r.uniform(0.03, 0.09))
        i = int(st * SR)
        m = min(len(g), n - i)
        y[i:i + m] += g[:m]
    y *= env_ar(n, 0.05, n_sec * 0.5)
    return y * gain / (np.max(np.abs(y)) + 1e-9)


def glitch(n_sec=0.14, gain=0.25, seed=3):
    r = np.random.default_rng(seed)
    n = int(n_sec * SR)
    y = np.zeros(n)
    i = 0
    while i < n:
        seg = int(r.uniform(0.006, 0.025) * SR)
        kind = r.integers(0, 3)
        if kind == 0:
            s = np.sign(np.sin(2 * np.pi * r.uniform(200, 1800) * t_axis(seg)))
        elif kind == 1:
            s = noise(seg)
            s = np.round(s * 3) / 3
        else:
            s = np.zeros(seg)
        y[i:i + seg] = s[:max(0, min(seg, n - i))] if i + seg <= n else s[:n - i]
        i += seg
    return hp(y, 300) * gain


def build_sfx():
    sfx = np.zeros((N, 2))
    # ambiente do quarto (zumbido + ar), até o mergulho
    n = int(4.4 * SR)
    hum = (sine(60, n) * 0.5 + sine(120, n) * 0.3 + sine(180, n) * 0.12) * 0.012
    air = lp(pink(n), 900) * 0.01
    room = (hum + air) * env_ar(n, 0.4, 0.3)
    place(sfx, stereo(room), 0)
    # 0,0 s: despertar — impacto suave + respiração de ar
    place(sfx, stereo(impact(1.6, 70, 38, body=0.5, crack=0.08, bright=2500)), 0.0)
    place(sfx, whoosh(0.45, 400, 2500, peak=0.3, gain=0.12), 0.0)
    place(sfx, whoosh(0.3, 2500, 600, peak=0.5, gain=0.06), 0.14)  # piscada
    # digitação da IA
    for i, _ in enumerate('Bom dia.'):
        place(sfx, stereo(click(0.05, rng.uniform(3500, 6000)), 0.05), 0.55 + i / 28)
    for i, ch in enumerate('Já fiz o seu trabalho.'):
        if ch != ' ':
            place(sfx, stereo(click(0.055, rng.uniform(3500, 6500)), 0.05), 1.12 + i / 26)
    # checks dos cards
    for k, tt in enumerate([1.7, 1.92, 2.14, 2.36]):
        f = [1318, 1568, 1760, 2093][k]
        place(sfx, stereo(blip(f, 0.25, 0.12, 0.06), [-0.5, -0.4, 0.4, 0.5][k]), tt)
    # 2,54 s: IA acorda — swell + impacto + shimmer
    n = int(1.6 * SR)
    tt = t_axis(n)
    fm = sine(220 + 30 * np.sin(2 * np.pi * 7 * tt), n) * env_exp(n, 0.02, 0.5)
    place(sfx, stereo(lp(fm, 2000) * 0.12), 2.52)
    place(sfx, stereo(impact(2.2, 64, 34, body=0.65, crack=0.12, bright=3000)), 2.54)
    place(sfx, reverb(stereo(shimmer(1.2, 2200, 0.1, 4)), IR_HALL, 0.5), 2.56)
    # riser até o vidro
    r = riser(1.25, 160, 1500, 0.22)
    place(sfx, stereo(r), EV['glass'] - 1.25)
    place(sfx, whoosh(0.5, 300, 5000, peak=0.85, gain=0.3), EV['glass'] - 0.45)
    # 4,25 s: atravessa o vidro — impacto + estilhaço digital + whoosh
    place(sfx, stereo(impact(2.4, 62, 30, body=0.9, crack=0.35, bright=9000)), EV['glass'])
    shards = np.zeros(int(0.5 * SR))
    for k in range(60):
        g = blip(rng.uniform(3000, 9000), 0.05, rng.uniform(0.02, 0.07), 0.008)
        i = int(rng.uniform(0, 0.35) * SR)
        shards[i:i + len(g)] += g[:len(shards) - i]
    place(sfx, reverb(stereo(shards), IR_ROOM, 0.4), EV['glass'])
    place(sfx, whoosh(0.7, 4500, 250, peak=0.12, gain=0.32, pan0=0.0, pan1=0.0), EV['glass'])
    for k, tt in enumerate(EV['pathCards']):
        pan = -0.7 if k % 2 == 0 else 0.7
        place(sfx, whoosh(0.22, 1800, 500, peak=0.55, gain=0.09, pan0=pan * 0.3, pan1=pan), tt - 0.14)
    # cascata de "CONCLUÍDO" na parede
    order = [5, 2, 9, 0, 7, 11, 3, 8, 1, 10, 4, 6]
    scale = [1046, 1174, 1318, 1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186, 4699]
    for k in range(12):
        tt = 4.6 + k * 0.04
        place(sfx, stereo(blip(scale[k], 0.18, 0.06, 0.04), 0.6 * np.sin(k * 1.7)), tt)
    # "MELHOR" — golpe
    place(sfx, stereo(impact(1.0, 90, 45, body=0.5, crack=0.3, bright=7000)), 5.1)
    place(sfx, reverb(stereo(click(0.25, 2500)), IR_ROOM, 0.3), 5.1)
    # barras de desempenho
    n = int(0.32 * SR)
    f = 500 * (2600 / 500) ** (t_axis(n) / 0.32)
    place(sfx, stereo(sine(f, n) * env_ar(n, 0.01, 0.08) * 0.05, -0.2), 5.3)
    # "QUE" / "VOCÊ." — tick + golpe + glitch
    place(sfx, stereo(click(0.12, 3000)), 5.5)
    place(sfx, stereo(impact(1.2, 75, 38, body=0.5, crack=0.35, bright=8000)), 5.63)
    place(sfx, stereo(glitch(0.14, 0.16, 5), 0.2), 5.63)
    # portal abre — acorde de luz + riser rápido + whoosh
    place(sfx, reverb(stereo(shimmer(0.8, 1600, 0.09, 8)), IR_HALL, 0.5), 5.9)
    place(sfx, stereo(riser(0.5, 250, 2200, 0.2)), EV['portal'] - 0.5)
    place(sfx, whoosh(0.45, 600, 7000, peak=0.9, gain=0.3), EV['portal'] - 0.4)
    place(sfx, whoosh(0.25, 2500, 700, peak=0.4, gain=0.12, pan0=0.6, pan1=-0.6), EV['textPass'] - 0.08)
    # 6,37 s: revelação do mundo — impacto grande + "braam"
    big = impact(3.0, 55, 28, body=1.0, crack=0.45, bright=6000)
    place(sfx, reverb(stereo(big), IR_HALL, 0.35), EV['portal'])
    n = int(2.1 * SR)
    br = np.zeros(n)
    for nn in ['C2', 'G2', 'C3', 'E3']:
        br += saw(note(nn), n) + saw(note(nn) * 1.004, n)
    br = sweep_filter(br, 2500, 250, 'low', curve=0.6) * env_exp(n, 0.01, 0.9) * 0.05
    place(sfx, reverb(stereo(br), IR_HALL, 0.4), EV['portal'])
    # ambiente da cidade + rastros passando
    n = int(2.2 * SR)
    city = lp(pink(n), 500) * 0.02 + bp(pink(n), 2000, 6000) * 0.004
    place(sfx, stereo(city * env_ar(n, 0.3, 0.2)), 6.3)
    for k in range(6):
        tt = 6.5 + k * 0.33 + rng.uniform(-0.05, 0.05)
        pan = rng.uniform(-0.8, 0.8)
        place(sfx, whoosh(0.35, 1200, 400, peak=0.5, gain=0.05, pan0=pan, pan1=-pan * 0.5), tt)
    # títulos holográficos
    place(sfx, reverb(stereo(shimmer(0.7, 2600, 0.075, 11)), IR_HALL, 0.45), 6.8)
    place(sfx, reverb(stereo(shimmer(0.8, 3100, 0.07, 12)), IR_HALL, 0.45), 7.22)
    for k, ch in enumerate('PARECE'):
        place(sfx, stereo(click(0.04, 6000), 0.1), 6.4 + k * 0.035)
    # final: glitch e corte
    place(sfx, stereo(glitch(0.12, 0.14, 21), -0.2), 8.36)
    return sfx


def sidechain(music, voice, depth_db=7.0):
    env = np.sqrt(signal.lfilter([0.004], [1, -0.996], voice ** 2) + 1e-12)
    env = env / (np.max(env) + 1e-9)
    # release lento
    rel = np.zeros_like(env)
    a_att, a_rel = np.exp(-1 / (0.01 * SR)), np.exp(-1 / (0.3 * SR))
    prev = 0
    for i, v in enumerate(env):
        a = a_att if v > prev else a_rel
        prev = a * prev + (1 - a) * v
        rel[i] = prev
    g = db(-depth_db * np.clip(rel * 3, 0, 1))
    return music * g[:, None]


def main():
    voice = build_voice()
    music = build_music()
    sfx = build_sfx()
    music = sidechain(music, voice, 7.0)
    sf.write(ROOT + 'voice_prev.wav', voice, SR, subtype='PCM_24')
    sf.write(ROOT + 'music_prev.wav', music / np.max(np.abs(music)) * 0.9, SR, subtype='PCM_24')
    sf.write(ROOT + 'sfx_prev.wav', sfx / np.max(np.abs(sfx)) * 0.9, SR, subtype='PCM_24')
    # níveis relativos: voz na frente, música discreta, efeitos como acentos
    v = stereo(voice) * db(0)
    m = music / np.max(np.abs(music)) * db(-17)
    s = sfx / np.max(np.abs(sfx)) * db(-9)
    mix = v + m + s
    # corte seco no último quadro (com micro-fade para não estalar)
    fo = int(0.012 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    mix = np.tanh(mix * 1.1) / 1.1
    sf.write(ROOT + 'mix_prev_premaster.wav', mix, SR, subtype='PCM_24')
    print('peaks voice/music/sfx/mix', [round(float(np.max(np.abs(a))), 3) for a in (v, m, s, mix)])


if __name__ == '__main__':
    main()
