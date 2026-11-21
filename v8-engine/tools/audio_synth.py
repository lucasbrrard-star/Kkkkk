"""Procedural sound design + original score for the V8 preview (30.000 s, 48 kHz stereo).

Everything here is synthesised (no third-party samples). Mechanical events are taken from the
same kinematics used by the animation (v8kin), so clicks, ignition and exhaust match the picture.
Narration comes from ElevenLabs (cache/audio/l*.mp3) and is time-fitted with rubberband.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'blender'))
from v8kin import theta_at, phi, OFF, FIRING, CYLS, valve_lift, side  # noqa: E402

SR = 48000
DUR = 30.0
N = int(SR * DUR)
T = np.arange(N) / SR
RNG = np.random.default_rng(11)
OUT = os.path.join(HERE, '..', 'cache', 'audio')
BPM = 96.0
BEAT = 60.0 / BPM


# ----------------------------------------------------------------------------- dsp helpers
def _sos(kind, f, order=2):
    return butter(order, f, btype=kind, fs=SR, output='sos')


def lp(x, f, o=2):
    return sosfilt(_sos('low', f, o), x)


def hp(x, f, o=2):
    return sosfilt(_sos('high', f, o), x)


def bp(x, lo, hi, o=2):
    return sosfilt(_sos('band', [lo, hi], o), x)


def noise(n):
    return RNG.standard_normal(n)


def secs(n):
    return np.arange(n) / SR


def smooth(x0, x1, x):
    t = np.clip((x - x0) / (x1 - x0), 0, 1)
    return t * t * (3 - 2 * t)


class Bus:
    def __init__(self):
        self.L = np.zeros(N)
        self.R = np.zeros(N)

    def add(self, sig, t0, gain=1.0, pan=0.0):
        i0 = int(round(t0 * SR))
        if i0 >= N:
            return
        if i0 < 0:
            sig = sig[-i0:]
            i0 = 0
        n = min(len(sig), N - i0)
        gl = gain * np.sqrt(0.5 * (1 - pan))
        gr = gain * np.sqrt(0.5 * (1 + pan))
        self.L[i0:i0 + n] += sig[:n] * gl
        self.R[i0:i0 + n] += sig[:n] * gr

    def add_full(self, sig, gain=1.0, pan=0.0):
        self.add(sig[:N], 0.0, gain, pan)

    def stereo(self):
        return np.stack([self.L, self.R], axis=1)


def reverb(st, rt=1.6, mix=0.25, pre=0.012, tone=4500):
    n = int(rt * SR)
    ir_t = secs(n)
    out = np.zeros_like(st)
    for ch in range(2):
        ir = noise(n) * np.exp(-ir_t * 6.9 / rt)
        ir = lp(ir, tone)
        ir[: int(pre * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
        wet = fftconvolve(st[:, ch], ir)[: len(st)]
        out[:, ch] = st[:, ch] * (1 - mix) + wet * mix * 0.9
    return out


def rms_env(x, win=0.05):
    w = int(win * SR)
    k = np.ones(w) / w
    return np.sqrt(np.convolve(x ** 2, k, mode='same'))


# ----------------------------------------------------------------------------- timing helpers
FR_T = np.arange(0, DUR, 1.0 / 600)            # fine time grid for event search
FR_TH = np.array([theta_at(t) for t in FR_T])


def crossings(values, level):
    """Times where values crosses level upward."""
    v = np.asarray(values)
    idx = np.where((v[:-1] < level) & (v[1:] >= level))[0]
    out = []
    for i in idx:
        a, b = v[i], v[i + 1]
        f = (level - a) / (b - a)
        out.append(FR_T[i] + f * (FR_T[i + 1] - FR_T[i]))
    return out


def theta_events(offset_deg):
    """Times when (theta - offset) passes multiples of 720."""
    k0 = int(np.floor((FR_TH[0] - offset_deg) / 720)) - 1
    k1 = int(np.ceil((FR_TH[-1] - offset_deg) / 720)) + 1
    ev = []
    for k in range(k0, k1 + 1):
        ev += crossings(FR_TH, offset_deg + 720 * k)
    return sorted(ev)


# ----------------------------------------------------------------------------- engine (real speed)
def rpm_profile(t):
    r = np.full_like(t, 760.0)
    blip = np.exp(-((t - 2.2) / 0.42) ** 2)
    r += 1900 * blip
    rev = smooth(25.7, 27.0, t) * (1 - smooth(27.6, 28.6, t))
    r += 2500 * rev
    return r


def engine_real():
    """Cross-plane V8 exhaust: per-bank pulse trains (uneven -> burble)."""
    t = T
    rpm = rpm_profile(t)
    ang = np.cumsum(rpm / 60.0 * 360.0) / SR          # crank degrees
    st = np.zeros((N, 2))
    k = secs(int(0.07 * SR))
    for bank, pan in ((1, -0.35), (-1, 0.35)):
        train = np.zeros(N)
        for c in CYLS:
            if side(c) != bank:
                continue
            evo = OFF[c] + 490.0                      # exhaust valve opening
            n0 = int(np.floor((ang[0] - evo) / 720)) - 1
            n1 = int(np.ceil((ang[-1] - evo) / 720)) + 1
            for m in range(n0, n1 + 1):
                a = evo + 720 * m
                i = np.searchsorted(ang, a)
                if 0 < i < N:
                    train[i] += 0.8 + 0.4 * RNG.random()
        load = 0.55 + 0.45 * np.clip((rpm - 760) / 2500, 0, 1)
        kern = (np.sin(2 * np.pi * 62 * k) * np.exp(-k / 0.022) * 1.0
                + bp(noise(len(k)), 180, 1400) * np.exp(-k / 0.009) * 0.7
                + hp(noise(len(k)), 2200) * np.exp(-k / 0.003) * 0.12)
        sig = fftconvolve(train, kern)[:N] * load
        res = bp(sig, 70, 140) * 1.6 + bp(sig, 200, 320) * 0.7 + sig * 0.5
        res = np.tanh(res * 1.8) * 0.6
        st[:, 0] += res * np.sqrt(0.5 * (1 - pan))
        st[:, 1] += res * np.sqrt(0.5 * (1 + pan))
    # intake / mechanical whine following rpm
    ph = np.cumsum(2 * np.pi * (rpm / 60.0) * 4) / SR
    whine = np.sin(ph) * 0.02 + bp(noise(N), 1500, 5000) * 0.006 * (rpm / 3000)
    st += whine[:, None]
    gate = smooth(0.0, 0.7, t) * (1 - smooth(4.0, 5.3, t)) + smooth(24.6, 25.4, t) * (1 - smooth(29.0, 30.0, t))
    st *= gate[:, None]
    return st


# ----------------------------------------------------------------------------- slow-motion world
def slowmo_layer(bus):
    t = T
    # low engine-room drone, slowed-down feel
    dr = lp(noise(N), 90, 4) * 0.9 + np.sin(2 * np.pi * 31 * t + 0.6 * np.sin(2 * np.pi * 0.2 * t)) * 0.25
    g = smooth(4.2, 5.6, t) * (1 - smooth(23.8, 25.4, t))
    bus.add_full(hp(dr, 32) * g * 0.14)
    # every combustion (any cylinder) -> deep slowed thump (visible in x-ray shots)
    k = secs(int(0.9 * SR))
    thump = (np.sin(2 * np.pi * (38 + 20 * np.exp(-k / 0.05)) * k) * np.exp(-k / 0.18)
             + lp(noise(len(k)), 220) * np.exp(-k / 0.06) * 0.5)
    for c in CYLS:
        for te in theta_events(OFF[c] + 352.0):
            if 5.0 <= te <= 25.0 and not (c == 1 and 15.0 < te < 16.0):
                vis = 0.6 if (te < 10.0 or te > 22.4) else 0.22
                bus.add(thump, te, 0.55 * vis, pan=0.25 * side(c))
    # mechanical ticks: valve openings/closings
    kk = secs(int(0.06 * SR))
    tick = (hp(noise(len(kk)), 3500) * np.exp(-kk / 0.004) * 0.6
            + np.sin(2 * np.pi * 2900 * kk) * np.exp(-kk / 0.018) * 0.35
            + np.sin(2 * np.pi * 4700 * kk) * np.exp(-kk / 0.01) * 0.2)
    lifts = {}
    for c in CYLS:
        for kind in ('in', 'ex'):
            lv = np.array([valve_lift(c, kind, th) for th in FR_TH]) * 1000
            lifts[(c, kind)] = lv
            ups = crossings(lv, 0.25)
            downs = crossings(-lv, -0.25)
            for te in ups + downs:
                if 5.0 <= te <= 10.0:
                    bus.add(tick, te, 0.05, pan=0.3 * side(c))
                elif c == 1 and 10.0 < te < 24.0:
                    bus.add(tick, te, 0.16, pan=-0.1)
    # gear/chain whir following visual crank speed
    w = np.gradient(np.interp(t, FR_T, FR_TH)) * SR            # deg/s
    whir = bp(noise(N), 900, 2600) * 0.03 + np.sin(np.cumsum(2 * np.pi * (w / 360.0) * 28) / SR) * 0.012
    gw = np.clip(w / 360.0, 0, 1.2) * smooth(4.8, 5.4, t) * (1 - smooth(9.6, 10.4, t))
    gw2 = np.clip(w / 360.0, 0, 1.0) * smooth(22.4, 23.4, t) * (1 - smooth(24.8, 25.4, t))
    bus.add_full(whir * (gw + gw2) * 0.9)
    # intake hiss shaped by cylinder-1 intake lift (10-13 s)
    li = np.interp(t, FR_T, lifts[(1, 'in')]) / 9.0
    hiss = bp(noise(N), 700, 3800) * li * smooth(9.9, 10.3, t) * (1 - smooth(13.2, 13.8, t))
    bus.add_full(hiss * 0.12, pan=-0.15)
    # compression tension: slow rising tone
    comp = np.sin(2 * np.pi * np.cumsum(55 + 50 * smooth(13.0, 15.3, t)) / SR)
    bus.add_full(comp * smooth(12.8, 15.0, t) * (1 - smooth(15.25, 15.4, t)) * 0.05)
    # exhaust whoosh shaped by cylinder-1 exhaust lift (19.8-23 s)
    le = np.interp(t, FR_T, lifts[(1, 'ex')]) / 9.0
    ex = (bp(noise(N), 250, 1600) * 0.6 + lp(noise(N), 160) * 0.8) * le
    ex *= smooth(19.7, 20.3, t) * (1 - smooth(22.6, 23.6, t))
    bus.add_full(ex * 0.22, pan=0.2)
    return lifts


def ignition(bus):
    t0 = [te for te in theta_events(OFF[1] + 345.0) if 15.0 < te < 15.6][0]
    k = secs(int(0.08 * SR))
    snap = hp(noise(len(k)), 2500) * np.exp(-k / 0.006)
    buzz = np.sign(np.sin(2 * np.pi * 2400 * k)) * np.exp(-k / 0.02) * 0.3
    bus.add(snap + buzz, t0, 0.5)
    k = secs(int(1.6 * SR))
    f = 95 * np.exp(-k / 0.25) + 34
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k / 0.45)
    boom += lp(noise(len(k)), 400) * np.exp(-k / 0.12) * 0.7
    boom = np.tanh(boom * 1.6)
    bus.add(boom, t0 + 0.06, 0.42)
    fw = bp(noise(int(1.0 * SR)), 300, 2200) * np.sin(np.pi * np.clip(secs(int(1.0 * SR)) / 1.0, 0, 1)) ** 2
    bus.add(fw, t0 + 0.02, 0.15)
    return t0


# ----------------------------------------------------------------------------- transitions
def whoosh(dur, f0, f1, bright=1.0):
    n = int(dur * SR)
    k = secs(n)
    x = noise(n)
    out = np.zeros(n)
    seg = int(0.02 * SR)
    for i in range(0, n, seg):
        fc = f0 * (f1 / f0) ** (i / n)
        lo, hi = max(40, fc * 0.6), min(SR / 2 - 100, fc * 1.6)
        out[i:i + seg] = bp(x[max(0, i - 2048):i + seg], lo, hi)[-len(out[i:i + seg]):]
    env = np.sin(np.pi * np.clip(k / dur, 0, 1)) ** 1.5
    return out * env * bright


def sub_hit(dur=1.2, f=42):
    k = secs(int(dur * SR))
    s = np.sin(2 * np.pi * (f + 30 * np.exp(-k / 0.04)) * k) * np.exp(-k / (dur * 0.35))
    s += lp(noise(len(k)), 180) * np.exp(-k / 0.05) * 0.4
    return np.tanh(s * 1.3)


def scan_tone(dur, f0, f1):
    k = secs(int(dur * SR))
    f = f0 * (f1 / f0) ** (k / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * k))
    return s * np.sin(np.pi * k / dur) ** 2


def transitions(bus):
    bus.add(whoosh(2.3, 3000, 900, 1.0), 1.85, 0.16, pan=-0.2)      # car x-ray sweep
    bus.add(scan_tone(1.1, 500, 1500), 3.85, 0.035)                 # engine x-ray scan
    bus.add(whoosh(1.2, 700, 2600), 3.85, 0.12, pan=0.2)
    bus.add(sub_hit(1.4), 4.98, 0.35)                               # into the block
    bus.add(whoosh(1.2, 2400, 300), 9.2, 0.2)                       # section cut
    bus.add(sub_hit(1.0, 48), 10.02, 0.3)
    bus.add(scan_tone(0.9, 1400, 600), 9.4, 0.03)
    bus.add(whoosh(1.8, 400, 2800), 21.8, 0.18, pan=-0.2)           # pull back
    bus.add(whoosh(1.4, 2600, 500), 25.2, 0.16, pan=0.2)            # back to solid
    bus.add(scan_tone(1.2, 1600, 520), 25.3, 0.03)
    bus.add(whoosh(2.2, 2200, 800), 26.8, 0.12)                     # car solidifies


# ----------------------------------------------------------------------------- score
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name, octv):
    return 440.0 * 2 ** ((NOTE[name] + 12 * (octv + 1) - 69) / 12)


CHORDS = [  # (start s, root, tones)
    (0.0, 'D', ['D', 'F', 'A']), (5.0, 'Bb', ['Bb', 'D', 'F']), (7.5, 'C', ['C', 'E', 'G']),
    (10.0, 'D', ['D', 'F', 'A']), (12.5, 'Bb', ['Bb', 'D', 'F']), (15.0, 'G', ['G', 'Bb', 'D']),
    (17.5, 'A', ['A', 'C#', 'E']), (20.0, 'D', ['D', 'F', 'A']), (22.5, 'Bb', ['Bb', 'D', 'F']),
    (23.75, 'C', ['C', 'E', 'G']), (25.0, 'D', ['D', 'F', 'A', 'E']),
]


def saw(f, k, phase=0.0):
    ph = (np.cumsum(np.full(len(k), f)) / SR + phase) % 1.0
    return 2 * ph - 1


def score():
    bus = Bus()
    t = T
    # pads
    for i, (st, root, tones) in enumerate(CHORDS):
        en = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
        n = int((en - st + 1.2) * SR)
        k = secs(n)
        pad = np.zeros(n)
        for j, nm in enumerate(tones):
            octv = 3 if j == 0 else 4
            f = hz(nm, octv)
            for det in (-0.12, 0.12):
                pad += saw(f * 2 ** (det / 12), k, RNG.random()) * 0.18
        pad = lp(pad, 1100 if st < 25 else 1700, 2)
        env = smooth(0, 0.6, k) * (1 - smooth(en - st, en - st + 1.2, k))
        bus.add(pad * env, st, 0.22)
        # bass on beats 1 & 3 from 5 s
        if st >= 5.0:
            bn = int(BEAT * 2 * SR)
            kb = secs(bn)
            fb = hz(root, 1)
            note = (np.sin(2 * np.pi * fb * kb) + 0.25 * saw(fb * 2, kb)) * np.exp(-kb / 0.5)
            note = lp(note, 300)
            b = st
            while b < en - 1e-6:
                bus.add(note, b, 0.3)
                b += BEAT * 2
    # 16th-note arpeggio pulse (5-24.5 s), quieter while narration is dense
    sixt = BEAT / 4
    kk = secs(int(sixt * 1.8 * SR))
    tt = 5.0
    step = 0
    while tt < 24.6:
        ch = [c for c in CHORDS if c[0] <= tt + 1e-6][-1]
        tones = ch[2][:3]
        nm = tones[[0, 1, 2, 1][step % 4]]
        f = hz(nm, 5) * (2 if step % 8 == 7 else 1)
        pl = (saw(f, kk) * 0.6 + np.sin(2 * np.pi * f * kk) * 0.4) * np.exp(-kk / 0.06)
        pl = lp(pl, 2600)
        acc = 1.0 if step % 4 == 0 else 0.6
        bus.add(pl, tt, 0.05 * acc, pan=0.25 * np.sin(step * 0.7))
        tt += sixt
        step += 1
    # low toms on scene downbeats + build
    k = secs(int(0.9 * SR))
    tom = np.sin(2 * np.pi * (60 + 40 * np.exp(-k / 0.03)) * k) * np.exp(-k / 0.22) + lp(noise(len(k)), 900) * np.exp(-k / 0.03) * 0.3
    for b in (5.0, 10.0, 20.0, 22.5, 23.75, 24.375):
        bus.add(tom, b, 0.32)
    for b in np.arange(22.5, 25.0, BEAT / 2):
        bus.add(tom, b, 0.12 + 0.1 * (b - 22.5) / 2.5)
    # riser into the finale
    n = int(2.6 * SR)
    k = secs(n)
    ris = bp(noise(n), 400, 6000) * (k / 2.6) ** 2 * 0.25 + np.sin(2 * np.pi * np.cumsum(200 + 600 * (k / 2.6) ** 2) / SR) * (k / 2.6) ** 2 * 0.05
    bus.add(ris, 22.4, 1.0)
    # finale hit + title impact
    bus.add(sub_hit(2.5, 38), 25.0, 0.5)
    k = secs(int(3.0 * SR))
    crash = hp(noise(len(k)), 3000) * np.exp(-k / 0.9) * 0.2
    bus.add(crash, 26.6, 0.5)
    bus.add(sub_hit(2.2, 36), 26.6, 0.4)
    st = bus.stereo()
    st = reverb(st, rt=2.4, mix=0.3)
    fade = 1 - smooth(28.6, 30.0, T)
    return st * fade[:, None]


# ----------------------------------------------------------------------------- narration
def narration():
    lines = json.load(open(os.path.join(HERE, 'narration.json')))
    fit = {'l1': None, 'l2': 4.6, 'l3': 4.6, 'l4': 4.55, 'l5': 4.55, 'l6': None}
    starts = {'l1': 0.35, 'l2': 5.25, 'l3': 10.2, 'l4': 15.2, 'l5': 20.2, 'l6': 25.55}
    bus = Bus()
    info = []
    for ln in lines:
        src = os.path.join(OUT, ln['id'] + '.mp3')
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]))
        al = json.load(open(os.path.join(OUT, ln['id'] + '.align.json')))
        speech = al['character_end_times_seconds'][-1]
        tgt = fit[ln['id']]
        tempo = max(1.0, speech / tgt) if tgt else 1.0
        wav = os.path.join(OUT, ln['id'] + '_fit.wav')
        af = f'aresample={SR},rubberband=tempo={tempo:.4f}:pitchq=quality,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', af, '-ac', '1', wav], check=True)
        x, sr = sf.read(wav)
        bus.add(x, starts[ln['id']], 1.0)
        info.append({'id': ln['id'], 'text': ln['text'], 'start': starts[ln['id']], 'end': round(starts[ln['id']] + speech / tempo, 3), 'tempo': round(tempo, 4)})
    json.dump(info, open(os.path.join(OUT, 'narration_timing.json'), 'w'), indent=1, ensure_ascii=False)
    return bus.stereo(), info


def main():
    voice, info = narration()
    sfx = Bus()
    slowmo_layer(sfx)
    ign = ignition(sfx)
    transitions(sfx)
    # studio room tone
    sfx.add_full(lp(noise(N), 300) * 0.012)
    sfx_st = reverb(sfx.stereo(), rt=1.4, mix=0.18)
    eng = engine_real()
    mus = score()
    # sidechain: duck music/engine under narration
    v_env = rms_env(voice[:, 0], 0.12)
    duck = 1 - 0.72 * np.clip(v_env / (v_env.max() * 0.2 + 1e-9), 0, 1)
    duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode='same')
    sfx_st = hp(sfx_st.T, 28).T
    mus = hp(mus.T, 38).T
    mix = voice * 2.4 + mus * 0.42 * duck[:, None] + sfx_st * 0.75 * (0.6 + 0.4 * duck)[:, None] + eng * 0.4 * (0.45 + 0.55 * duck)[:, None]
    for name, st in (('stem_voice', voice), ('stem_music', mus), ('stem_sfx', sfx_st), ('stem_engine', eng)):
        sf.write(os.path.join(OUT, name + '.wav'), st.astype(np.float32), SR)
    peak = np.max(np.abs(mix))
    mix = mix / peak * 0.89
    raw = os.path.join(OUT, 'mix_raw.wav')
    sf.write(raw, mix.astype(np.float32), SR)
    final = os.path.join(OUT, 'mix.wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af',
                    'loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000', '-ar', '48000', '-c:a', 'pcm_s16le', final], check=True)
    print('ignition at', round(ign, 3), 's')
    print(json.dumps(info, ensure_ascii=False, indent=1))
    print('wrote', final)


if __name__ == '__main__':
    main()
