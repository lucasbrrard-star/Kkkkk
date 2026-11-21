"""Desenho de som procedural sincronizado com a animação + mixagem com a narração.

Tudo é sintetizado aqui (sem bibliotecas de áudio de terceiros), a partir dos mesmos dados
de cinemática/linha do tempo usados no Blender: centelhas, válvulas, varreduras e câmera.
Os sons são ILUSTRATIVOS (desenho de som), não gravações dos componentes.

Uso: python audio.py  (requer numpy, scipy, soundfile)
"""
import os
import sys
import json
import subprocess
import numpy as np
from scipy import signal
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kin as K  # noqa: E402
import timeline as TL  # noqa: E402

SR = 48000
DUR = 30.0
N = int(SR * DUR)
T = np.arange(N) / SR
RNG = np.random.default_rng(7)
OUT = os.path.join(HERE, '..', 'build', 'audio')


def db(x):
    return 10 ** (x / 20)


def sos(kind, f, order=2, **kw):
    if kind == 'bp':
        return signal.butter(order, [f[0], f[1]], 'bandpass', fs=SR, output='sos')
    return signal.butter(order, f, kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def env_ad(n, a, d, curve=4.0):
    """ataque linear (a s) + decaimento exponencial (d s) em n amostras"""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), np.exp(-(t - a) / max(d, 1e-4) * curve / 4))
    return e


def place(buf, x, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    if i < 0:
        x = x[-i:]
        i = 0
        j = min(len(buf), len(x))
    buf[i:j] += gain * x[: j - i]


def noise(n):
    return RNG.standard_normal(n)


def pink(n):
    w = noise(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 6


def smooth_curve(keys):
    f = K.pchip(keys)
    return np.array([f(t) for t in T[::48]]).repeat(48)[:N]


def stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], 1)


def reverb_ir(seconds=1.8, damp=6000):
    n = int(seconds * SR)
    ir = noise(n) * np.exp(-np.arange(n) / SR * 6.9 / seconds)
    ir = filt(ir, 'low', damp)
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir ** 2))


IR_L = reverb_ir()
IR_R = reverb_ir()


def reverb(st, wet=0.25):
    l = signal.fftconvolve(st[:, 0], IR_L)[:N]
    r = signal.fftconvolve(st[:, 1], IR_R)[:N]
    return st * (1 - wet) + np.stack([l, r], 1) * wet


# ---------------------------------------------------------------- motor V8 (ilustrativo)
BANKS = ['R', 'L', 'R', 'L', 'L', 'R', 'L', 'R']   # ordem 1-5-4-8-6-3-7-2


def v8_engine(rpm, load):
    """trem de pulsos por banco (virabrequim cross-plane -> intervalos desiguais por banco = 'ronco')"""
    ang = np.cumsum(rpm / 60.0 * 360.0 / SR)
    idx = np.floor(ang / 90.0).astype(np.int64)
    fires = np.nonzero(np.diff(idx) > 0)[0] + 1
    out = {'R': np.zeros(N), 'L': np.zeros(N)}
    k = int(0.012 * SR)
    kern_t = np.arange(k) / SR
    for n_, i in enumerate(fires):
        bank = BANKS[idx[i] % 8]
        amp = (0.55 + 0.45 * load[i]) * (1 + 0.12 * RNG.standard_normal())
        kern = np.exp(-kern_t / (0.0028 + 0.002 * (1 - load[i]))) * (np.sin(2 * np.pi * 95 * kern_t) + 0.6 * noise(k) * 0.5)
        j = min(N, i + k)
        out[bank][i:j] += amp * kern[: j - i]
    st = np.zeros((N, 2))
    for bank, pan in (('R', -0.35), ('L', 0.35)):
        x = out[bank]
        x = filt(x, 'low', 1400, 2) + 0.5 * filt(x, 'bp', (60, 160), 2) * 3
        st += stereo(x, pan)
    # tom mecânico e fluxo de admissão
    mech = filt(noise(N), 'bp', (1800, 5000), 2) * 0.05 * (rpm / 3000.0)
    st += stereo(mech, 0)
    lp_sos = signal.butter(2, 2600, 'low', fs=SR, output='sos')
    st = signal.sosfilt(lp_sos, st, axis=0)
    return st


def build():
    os.makedirs(OUT, exist_ok=True)
    data = json.load(open(os.path.join(OUT, '..', 'anim_data.json')))
    sparks = data['sparks']
    theta = np.array(data['theta'])
    tf = np.arange(len(theta)) / K.FPS

    # --------------------------------------------- motor: rotação ilustrativa e carga
    rpm = smooth_curve([(0, 760), (0.12, 760), (0.42, 3900), (0.78, 2600), (1.35, 900), (2.2, 780), (4.2, 760), (5.6, 700),
                        (24.6, 700), (25.6, 820), (27.4, 800), (27.75, 3300), (28.25, 2200), (28.9, 880), (30, 820)])
    load = smooth_curve([(0, 0.3), (0.12, 0.3), (0.3, 1.0), (0.6, 0.2), (1.3, 0.3), (27.5, 0.3), (27.65, 1.0), (28.0, 0.2), (30, 0.3)])
    eng = v8_engine(rpm, load)
    eg = smooth_curve([(0, 0.0), (0.05, 0.75), (0.9, 1.0), (1.3, 0.55), (4.0, 0.45), (5.2, 0.0), (24.9, 0.0), (26.3, 0.5),
                       (27.5, 0.55), (27.7, 1.0), (28.6, 0.7), (29.2, 0.5), (29.85, 0.0), (30, 0.0)])
    eng *= eg[:, None] * 0.9

    sfx = np.zeros((N, 2))
    # --------------------------------------------- pulsos de combustão sincronizados (visão em raio-x / aceleração final)
    for (ts, c) in sparks:
        if 5.3 <= ts <= 9.6 or 22.6 <= ts <= 26.0:
            n = int(0.18 * SR)
            tt = np.arange(n) / SR
            f0 = 58 + 6 * RNG.standard_normal()
            thump = np.sin(2 * np.pi * (f0 * tt - 18 * tt ** 2)) * np.exp(-tt / 0.045)
            thump += filt(noise(n), 'low', 500) * np.exp(-tt / 0.02) * 0.4
            pan = -0.3 if c <= 4 else 0.3
            g = 0.32 if ts < 10 else 0.28 * min(1.0, (26.0 - ts) / 0.8)
            place(sfx, stereo(thump, pan), ts, g)

    # --------------------------------------------- cilindro 1 em close (10–22.5 s)
    def lift_series(kind):
        return np.array([K.valve_lift_profile(kind, K.psi(th, 1)) for th in theta])
    for kind in 'IE':
        L = lift_series(kind)
        is_open = L > 0.0004
        for i in range(1, len(L)):
            if is_open[i] != is_open[i - 1] and 9.6 < tf[i] < 22.7:
                n = int(0.06 * SR)
                tt = np.arange(n) / SR
                tick = filt(noise(n), 'bp', (2500, 7000)) * np.exp(-tt / 0.006) + np.sin(2 * np.pi * 900 * tt) * np.exp(-tt / 0.01) * 0.3
                place(sfx, stereo(tick, 0.25 if kind == 'I' else -0.25), tf[i], 0.22 if not is_open[i] else 0.12)
    # fluxo de admissão e escape (amplitude ~ levantamento x velocidade do pistão)
    LI = np.interp(T, tf, lift_series('I')) / 0.0105
    LE = np.interp(T, tf, lift_series('E')) / 0.0100
    w = np.interp(T, tf, np.gradient(theta, 1 / K.FPS)) / 80.0
    closeup = smooth_curve([(0, 0), (9.6, 0), (10.0, 1), (22.4, 1), (22.9, 0), (30, 0)])
    air = filt(pink(N), 'bp', (350, 2600)) * 0.07
    swirl = 1 + 0.25 * np.sin(2 * np.pi * 3.1 * T)
    sfx += stereo(air * LI * np.clip(w, 0, 1.5) * closeup * swirl, 0.3)
    exh = filt(pink(N), 'bp', (120, 1100)) * 0.10
    sfx += stereo(exh * LE * np.clip(w, 0, 1.5) * closeup, -0.3)
    # compressão: tom ascendente
    comp = smooth_curve([(0, 0), (12.6, 0), (14.9, 1), (15.15, 0.0), (30, 0)])
    f_c = 48 + 70 * comp
    ph = np.cumsum(2 * np.pi * f_c / SR)
    sfx += stereo((np.sin(ph) * 0.05 + filt(noise(N), 'bp', (200, 900)) * 0.025) * comp, 0)
    # centelha (estalo elétrico) e combustão (baque grave)
    t_sp = [ts for (ts, c) in sparks if c == 1 and 14.5 < ts < 16][0]
    n = int(0.12 * SR)
    tt = np.arange(n) / SR
    crack = filt(noise(n), 'hp', 2500, 2) * (RNG.random(n) < 0.08) * 3.0 * np.exp(-tt / 0.035)
    crack += filt(noise(n), 'bp', (3000, 9000)) * np.exp(-tt / 0.004) * 1.2
    place(sfx, stereo(crack, 0.0), t_sp, 0.35)
    n = int(1.6 * SR)
    tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (62 * tt - 9 * tt ** 2)) * np.minimum(1, tt / 0.06) * np.exp(-tt / 0.42)
    boom += filt(noise(n), 'low', 380, 2) * np.minimum(1, tt / 0.25) * np.exp(-tt / 0.35) * 0.9
    place(sfx, stereo(boom, 0.0), t_sp + 0.12, 0.55)
    # expansão: pressão empurrando (ruído grave decrescente)
    pw = smooth_curve([(0, 0), (16.0, 0), (16.5, 1), (19.2, 0.15), (19.6, 0), (30, 0)])
    sfx += stereo(filt(pink(N), 'low', 220, 2) * 0.12 * pw, 0)
    # --------------------------------------------- transições
    def whoosh(t0, dur, f0, f1, gain, pan=0.0):
        n = int(dur * SR)
        tt = np.arange(n) / SR
        x = noise(n)
        out = np.zeros(n)
        steps = 24
        for k in range(steps):
            a, b = int(k * n / steps), int((k + 1) * n / steps)
            fc = f0 * (f1 / f0) ** ((k + 0.5) / steps)
            seg = filt(x[max(0, a - 2000):b], 'bp', (fc * 0.6, min(fc * 1.7, 20000)), 2)
            out[a:b] = seg[-(b - a):]
        e = np.sin(np.pi * tt / dur) ** 2
        place(sfx, stereo(out * e, pan), t0, gain)

    def hit(t0, gain, f=48):
        n = int(2.2 * SR)
        tt = np.arange(n) / SR
        x = np.sin(2 * np.pi * (f * tt - 6 * tt ** 2)) * np.exp(-tt / 0.6) * np.minimum(1, tt / 0.01)
        x += filt(noise(n), 'low', 1200) * np.exp(-tt / 0.08) * 0.5
        place(sfx, stereo(x, 0), t0, gain)

    def clunk(t0, gain):
        n = int(0.4 * SR)
        tt = np.arange(n) / SR
        x = np.sin(2 * np.pi * 140 * tt) * np.exp(-tt / 0.05) + filt(noise(n), 'bp', (300, 2500)) * np.exp(-tt / 0.03) * 0.8
        place(sfx, stereo(x, 0), t0, gain)
    whoosh(2.45, 1.4, 300, 2200, 0.10, 0.2)           # capô abrindo
    whoosh(4.3, 1.3, 400, 6000, 0.09)                # corte técnico (varredura)
    hit(5.35, 0.30)
    whoosh(5.0, 1.5, 2000, 9000, 0.035, -0.3)        # raio-x
    whoosh(8.9, 1.15, 5000, 250, 0.12)               # mergulho no cilindro
    hit(9.95, 0.22, 42)
    whoosh(22.4, 1.4, 250, 4000, 0.11)               # recuo
    whoosh(25.05, 1.3, 4000, 300, 0.09)              # montagem de volta
    clunk(26.24, 0.30)
    clunk(27.58, 0.40)                               # capô fechando
    hit(27.6, 0.38, 40)
    # ambiência de estúdio
    sfx += stereo(filt(pink(N), 'low', 900) * db(-52), 0)

    # --------------------------------------------- trilha instrumental (sintetizada)
    music = np.zeros((N, 2))

    def note(f):
        return 440 * 2 ** ((f - 69) / 12)
    chords = [(0.0, [38, 50, 57, 62, 65]), (5.0, [34, 46, 53, 58, 62]), (10.0, [41, 53, 57, 60, 65]),
              (15.0, [36, 48, 55, 60, 64]), (20.0, [38, 50, 57, 62, 65]), (25.0, [34, 46, 53, 58, 65]), (27.6, [38, 50, 57, 62, 66])]
    for ci, (t0, notes) in enumerate(chords):
        t1 = chords[ci + 1][0] if ci + 1 < len(chords) else DUR
        a, b = int(t0 * SR), int(min(DUR, t1 + 1.2) * SR)
        tt = np.arange(b - a) / SR
        pad = np.zeros(b - a)
        for nn in notes:
            for det in (-0.08, 0.0, 0.07):
                f = note(nn + det)
                pad += signal.sawtooth(2 * np.pi * f * tt + RNG.random() * 6) * (0.6 if nn < 45 else 0.35)
        pad = filt(pad, 'low', 700 if ci < 6 else 1400, 2)
        e = np.minimum(1, tt / 0.8) * np.clip((t1 + 1.2 - t0 - tt) / 1.2, 0, 1)
        pad *= e
        music[a:b] += stereo(pad, -0.15) * 0.5 + stereo(np.roll(pad, 240), 0.15) * 0.5
    # pulso grave em colcheias (96 bpm) a partir de 5 s
    beat = 60 / 96 / 2
    roots = {0: 38, 5: 34, 10: 41, 15: 36, 20: 38, 25: 34, 27.6: 38}
    tb = 5.0
    while tb < 29.0:
        r = [v for k, v in roots.items() if k <= tb][-1]
        n = int(0.22 * SR)
        tt = np.arange(n) / SR
        x = signal.sawtooth(2 * np.pi * note(r) * tt) * np.exp(-tt / 0.09)
        x = filt(x, 'low', 420, 2)
        accent = 1.0 if int(round((tb - 5.0) / beat)) % 4 == 0 else 0.6
        place(music, stereo(x, 0), tb, 0.55 * accent)
        tb += beat
    # tique metálico discreto (semicolcheias) no trecho técnico
    tb = 10.0
    while tb < 22.4:
        n = int(0.03 * SR)
        x = filt(noise(n), 'hp', 6000) * np.exp(-np.arange(n) / SR / 0.004)
        place(music, stereo(x, 0.4), tb, 0.06)
        tb += beat / 2
    music = reverb(music, 0.35) * 0.22
    # subida antes do título
    n = int(2.0 * SR)
    tt = np.arange(n) / SR
    rise = filt(noise(n), 'bp', (800, 6000)) * (tt / 2.0) ** 3
    place(music, stereo(rise, 0), 25.6, 0.06)

    # --------------------------------------------- narração
    narr = np.zeros(N)
    spans = []
    for i, (t0, _, _) in enumerate(TL.NARRATION):
        path = os.path.join(OUT, f'adam_{i + 1}.mp3')
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True).stdout
        x = np.frombuffer(raw, np.float32).astype(np.float64)
        x = filt(x, 'hp', 85, 2)
        # aparo do silêncio final
        nz = np.nonzero(np.abs(x) > 0.01)[0]
        x = x[: nz[-1] + int(0.08 * SR)]
        x = x / (np.sqrt(np.mean(x[np.abs(x) > 0.02] ** 2)) + 1e-9) * db(-17)
        place(narr, x, t0)
        spans.append((t0, t0 + len(x) / SR))
    # compressão leve (envelope)
    env = np.sqrt(np.maximum(signal.sosfilt(sos('low', 12), narr ** 2), 0) + 1e-12)
    gain = np.where(env > db(-20), (db(-20) / env) ** 0.35, 1.0)
    narr = narr * gain
    # ducking
    duck = np.zeros(N)
    for (a, b) in spans:
        duck[int(a * SR):int(b * SR)] = 1
    duck = signal.sosfilt(sos('low', 4), duck)
    duck = np.clip(duck * 1.2, 0, 1)
    duck_g = 1 - 0.5 * duck
    mix = stereo(narr, 0) * 0.98 + (music * duck_g[:, None]) + (sfx * (1 - 0.3 * duck)[:, None]) + eng * (1 - 0.45 * duck)[:, None]
    # fades nas pontas
    fi = int(0.03 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = int(0.25 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    peak = np.max(np.abs(mix))
    mix = mix / peak * db(-3)
    sf.write(os.path.join(OUT, 'mix_raw.wav'), mix.astype(np.float32), SR, subtype='FLOAT')
    for name, st in (('stem_music', music), ('stem_sfx', sfx), ('stem_engine', eng)):
        sf.write(os.path.join(OUT, name + '.wav'), (st / (np.max(np.abs(st)) + 1e-9) * 0.5).astype(np.float32), SR)
    sf.write(os.path.join(OUT, 'stem_narration.wav'), (narr / np.max(np.abs(narr)) * 0.7).astype(np.float32), SR)
    json.dump({'narration_spans': spans, 'spark_c1': t_sp}, open(os.path.join(OUT, 'audio_meta.json'), 'w'), indent=1)
    print('spans', [(round(a, 2), round(b, 2)) for a, b in spans], 'spark', round(t_sp, 3))


if __name__ == '__main__':
    build()
