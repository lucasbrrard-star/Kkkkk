"""Áudio do vídeo completo (40 s): voz completa, trilha estendida e sound design de todas as cenas.

Uso: python3 tools/build_audio_full.py -> assets/audio/mix_full_premaster.wav
"""
import sys
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, 'tools')
import build_audio as A  # noqa: E402

TOTAL = 40.0
SR = A.SR
NT = int(TOTAL * SR)
BEAT = A.BEAT
rng = np.random.default_rng(2024)
stereo, place, lp, hp, bp = A.stereo, A.place, A.lp, A.hp, A.bp
t_axis, env_exp, env_ar, noise, pink, sine, saw, note = A.t_axis, A.env_exp, A.env_ar, A.noise, A.pink, A.sine, A.saw, A.note
whoosh, blip, click, shimmer, impact, reverb, riser = A.whoosh, A.blip, A.click, A.shimmer, A.impact, A.reverb, A.riser


# ------------------------------------------------------------------ trilha
PADS = [
    (0.0, 4.25, ['A2', 'E3', 'A3', 'B3', 'C4'], 0.0, 0.5),
    (4.25, 6.37, ['F2', 'C3', 'A3', 'E4'], 0.35, 0.36),
    (6.37, 8.5, ['C2', 'G2', 'E3', 'B3', 'D4', 'F#4'], 0.8, 0.45),
    (8.5, 10.62, ['A2', 'E3', 'A3', 'C4', 'E4'], 0.6, 0.4),
    (10.62, 12.74, ['F2', 'C3', 'A3', 'C4', 'E4'], 0.6, 0.4),
    (12.74, 13.85, ['G2', 'D3', 'B3', 'D4'], 0.6, 0.4),
    (13.85, 16.9, ['D2', 'A2', 'F3', 'A3', 'E4'], 0.3, 0.42),
    (16.9, 18.0, ['F2', 'C3', 'A3', 'C4', 'G4'], 0.6, 0.42),
    (18.0, 19.1, ['C2', 'G2', 'E3', 'G3', 'D4'], 0.7, 0.42),
    (19.1, 21.2, ['A2', 'E3', 'A3', 'C4'], 0.4, 0.42),
    (21.2, 22.7, ['E2', 'B2', 'G#3', 'D4'], 0.5, 0.45),
    (22.7, 28.9, ['A1', 'E2', 'A2'], 0.0, 0.32),
    (28.9, 30.0, ['F2', 'C3', 'A3', 'C4', 'G4'], 0.5, 0.42),
    (30.0, 31.25, ['C2', 'G2', 'E3', 'G3', 'D4'], 0.8, 0.45),
    (31.25, 33.37, ['A2', 'E3', 'A3', 'C4', 'E4'], 0.6, 0.42),
    (33.37, 35.5, ['F2', 'C3', 'A3', 'C4', 'E4'], 0.7, 0.42),
    (35.5, 37.6, ['C2', 'G2', 'E3', 'G3', 'D4'], 0.7, 0.42),
    (37.6, 40.0, ['G2', 'D3', 'C4', 'D4', 'A4'], 0.6, 0.42),
]
PULSE = [  # (t0, t1, sequência, corte, volume)
    (2.124, 4.25, ['A2', 'A2', 'E3', 'A2', 'C3', 'A2', 'E3', 'B2'], 700, 0.07),
    (4.25, 6.37, ['F2', 'F2', 'C3', 'F2', 'A2', 'F2', 'C3', 'E3'], 1500, 0.085),
    (6.37, 8.5, ['C3', 'C3', 'G3', 'C3', 'E3', 'C3', 'G3', 'D3'], 2600, 0.1),
    (8.5, 10.62, ['A2', 'A2', 'E3', 'A2', 'C3', 'A2', 'E3', 'B2'], 2200, 0.09),
    (10.62, 12.74, ['F2', 'F2', 'C3', 'F2', 'A2', 'F2', 'C3', 'E3'], 2200, 0.09),
    (12.74, 13.85, ['G2', 'G2', 'D3', 'G2', 'B2', 'G2', 'D3', 'A2'], 2200, 0.09),
    (13.85, 16.9, ['D3', 'D3', 'A3', 'D3', 'F3', 'D3', 'A3', 'E3'], 1400, 0.08),
    (16.9, 19.1, ['F3', 'F3', 'C4', 'F3', 'A3', 'F3', 'C4', 'G3'], 2400, 0.09),
    (19.1, 22.6, ['A2', 'A2', 'E3', 'A2', 'C3', 'A2', 'E3', 'B2'], 1800, 0.085),
    (29.7, 31.25, ['C3', 'C3', 'G3', 'C3', 'E3', 'C3', 'G3', 'D3'], 2000, 0.07),
    (31.25, 39.2, ['A2', 'A2', 'E3', 'A2', 'C3', 'A2', 'E3', 'B2'], 2000, 0.085),
]


def build_music_full():
    mus = np.zeros((NT, 2))
    for (t0, t1, chord, bright, gain) in PADS:
        n = int((t1 - t0 + 0.6) * SR)
        p = A.pad_chord(chord, n, bright)
        e = env_ar(n, 0.35 if t0 in (0.0, 22.7) else 0.08, 0.6)
        if t0 == 0:
            e *= np.clip(t_axis(n) / 0.15, 0, 1)
        sw = 1 + 0.25 * np.sin(2 * np.pi * 0.23 * t_axis(n))
        l = p * e * sw * gain
        r = np.roll(p, 240) * e * sw * gain
        place(mus, np.stack([l, r], axis=1), max(0, t0 - 0.05))
    step = BEAT / 4
    for (t0, t1, seq, cut0, vol0) in PULSE:
        i = 0
        tt = t0
        while tt < t1 - 0.02:
            f = note(seq[i % 8])
            n = int(0.22 * SR)
            y = (saw(f, n) + 0.5 * saw(f * 2.005, n)) * env_exp(n, 0.002, 0.07)
            cut = cut0 * (1 + 0.6 * ((i % 4) == 0))
            y = lp(y, cut, 2)
            vol = vol0 * (1.0 if i % 4 == 0 else 0.7)
            if t0 == 2.124:
                vol *= np.clip((tt - 2.124) / 1.5, 0.15, 1)
            if t1 == 39.2:
                vol *= np.clip((39.2 - tt) / 1.2, 0, 1)
            place(mus, stereo(y * vol, 0.35 * np.sin(i * 1.3)), tt)
            tt += step
            i += 1
    for (t0, t1, root, gain) in [(2.124, 4.25, 'A1', 0.16), (4.25, 6.37, 'F1', 0.2), (6.37, 8.5, 'C2', 0.22), (8.5, 10.62, 'A1', 0.2),
                                 (10.62, 12.74, 'F1', 0.2), (12.74, 13.85, 'G1', 0.2), (13.85, 16.9, 'D2', 0.18), (16.9, 18.0, 'F1', 0.2),
                                 (18.0, 19.1, 'C2', 0.2), (19.1, 21.2, 'A1', 0.2), (21.2, 22.6, 'E1', 0.22), (28.9, 30.0, 'F1', 0.16),
                                 (30.0, 31.25, 'C2', 0.18), (31.25, 33.37, 'A1', 0.2), (33.37, 35.5, 'F1', 0.2), (35.5, 37.6, 'C2', 0.2), (37.6, 39.8, 'G1', 0.18)]:
        n = int((t1 - t0) * SR)
        y = sine(note(root), n) * env_ar(n, 0.04, 0.15) * gain
        place(mus, stereo(np.tanh(y * 2.2) / 2.2), t0)
    # percussão
    def kick(tt, g=0.32):
        n = int(0.4 * SR)
        f = 50 + 90 * np.exp(-t_axis(n) / 0.03)
        place(mus, stereo(sine(f, n) * env_exp(n, 0.001, 0.18) * g), tt)
    for k in range(4):
        kick(4.25 + k * BEAT)
    for (t0, t1) in [(8.5, 13.8), (19.1, 22.5), (31.25, 38.8)]:
        tt = t0
        while tt < t1:
            kick(tt, 0.24)
            tt += BEAT
    for (t0, t1) in [(6.37, 8.5), (10.62, 13.8), (16.9, 19.0), (33.37, 38.8)]:
        k = 0
        tt = t0
        while tt < t1:
            n = int(0.05 * SR)
            y = hp(noise(n), 7000) * env_exp(n, 0.0005, 0.012) * (0.05 if k % 2 else 0.08)
            place(mus, stereo(y, 0.3 * (1 if k % 2 else -1)), tt)
            tt += BEAT / 4
            k += 1
    # pausa reflexiva: sinos esparsos + batimento
    bells = ['A4', 'E5', 'C5', 'B4', 'A4', 'G4', 'E5']
    for k, nn in enumerate(bells):
        tt = 23.3 + k * 0.82
        n = int(1.6 * SR)
        f = note(nn)
        y = (sine(f, n) + 0.3 * sine(f * 2.76, n) + 0.12 * sine(f * 5.4, n)) * env_exp(n, 0.004, 0.55) * 0.07
        place(mus, stereo(y, 0.3 * np.sin(k)), tt)
    for k in range(8):
        tt = 27.5 + k * 0.5
        if tt > 28.9:
            break
        n = int(0.3 * SR)
        y = sine(55 * np.ones(n), n) * env_exp(n, 0.002, 0.09) * 0.3
        place(mus, stereo(y), tt)
        place(mus, stereo(y * 0.6), tt + 0.18)
    mus = reverb(mus, A.IR_HALL, 0.32)
    mus = A.peq(mus, 2000, -4.5, 0.8)
    fo = int(1.2 * SR)
    mus[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    return mus


# ------------------------------------------------------------------ sound design
def sfx_full():
    sys.path.insert(0, 'tools')
    import build_audio_v2 as V
    sfx = np.zeros((NT, 2))
    v2 = V.build_sfx_v2()
    sfx[:len(v2)] += v2
    # E — janelas viram painéis e ganham IA
    place(sfx, whoosh(0.6, 400, 3000, peak=0.5, gain=0.12), 8.4)
    for i in range(6):
        place(sfx, whoosh(0.35, 1500, 600, peak=0.4, gain=0.05, pan0=-0.6 + i * 0.24, pan1=-0.3 + i * 0.12), 8.5 + i * 0.05)
    for i, tt in enumerate([9.45, 9.62, 9.79, 9.96, 10.13, 10.3]):
        n = int(0.38 * SR)
        f = 1200 * (3200 / 1200) ** (t_axis(n) / 0.38)
        place(sfx, stereo(sine(f, n) * env_ar(n, 0.02, 0.1) * 0.035, -0.6 + 0.6 * (i % 3)), tt)
        place(sfx, stereo(blip(1568 + i * 120, 0.18, 0.08, 0.05), -0.6 + 0.6 * (i % 3)), tt + 0.3)
    # F — escritório: organograma -> rede
    place(sfx, whoosh(0.6, 2500, 400, peak=0.3, gain=0.12), 10.8)
    for k in range(6):
        place(sfx, stereo(click(0.05, 2800), rng.uniform(-0.5, 0.5)), 11.05 + k * 0.05)
    place(sfx, reverb(stereo(shimmer(0.8, 1800, 0.07, 31)), A.IR_HALL, 0.4), 11.4)
    for k in range(3):
        place(sfx, stereo(blip(880 * (1.25 ** k), 0.2, 0.09, 0.06), -0.4 + 0.4 * k), 11.42 + k * 0.08)
    tt = 11.7
    while tt < 13.4:
        place(sfx, stereo(blip(rng.uniform(2200, 3800), 0.04, 0.012, 0.008), rng.uniform(-0.7, 0.7)), tt)
        tt += rng.uniform(0.06, 0.16)
    place(sfx, whoosh(0.55, 300, 2500, peak=0.85, gain=0.1), 13.2)
    # G/H — tarefas absorvidas e novas profissões
    n = int(0.6 * SR)
    sw = A.sweep_filter(pink(n), 6000, 400, 'band', curve=0.8)
    place(sfx, stereo(sw / np.max(np.abs(sw)) * env_ar(n, 0.3, 0.05) * 0.06), 13.4)
    for k in range(6):
        place(sfx, stereo(click(0.06, 2200), -0.4 if k < 3 else 0.4), 13.85 + k * 0.08)
    n = int(0.9 * SR)
    f = 600 * (1400 / 600) ** (t_axis(n) / 0.9)
    place(sfx, stereo(sine(f, n) * env_ar(n, 0.1, 0.2) * 0.03), 14.55)
    for tt in [15.66, 15.84, 16.02]:
        place(sfx, whoosh(0.4, 3000, 500, peak=0.7, gain=0.08, pan0=-0.6, pan1=0.0), tt)
        place(sfx, stereo(impact(0.6, 90, 50, body=0.3, crack=0.05, bright=2000)), tt + 0.35)
    for k, tt in enumerate([17.36, 17.62, 17.88]):
        place(sfx, reverb(stereo(shimmer(0.5, 2200 + k * 300, 0.06, 40 + k), -0.4), A.IR_HALL, 0.4), tt - 0.1)
        place(sfx, reverb(stereo(A.blip(note(['C5', 'E5', 'G5'][k]), 0.5, 0.09, 0.2), -0.4), A.IR_ROOM, 0.3), tt)
    place(sfx, whoosh(0.5, 2200, 600, peak=0.4, gain=0.1, pan0=-0.3, pan1=0.6), 18.95)
    # I — escada rolante
    n = int(3.5 * SR)
    hum = (sine(48, n) * 0.5 + sine(96, n) * 0.25 + bp(pink(n), 200, 700) * 0.4) * 0.02 * env_ar(n, 0.4, 0.6)
    place(sfx, stereo(hum), 19.1)
    tt = 19.3
    while tt < 22.6:
        place(sfx, stereo(click(0.03, 1200), 0.3), tt)
        tt += 0.46
    place(sfx, whoosh(1.4, 300, 900, peak=0.5, gain=0.06), 21.25)
    place(sfx, reverb(stereo(A.blip(note('E5'), 0.6, 0.06, 0.25), 0.2), A.IR_HALL, 0.4), 22.05)
    for k in range(3):
        n = int(0.25 * SR)
        f = 400 * (80 / 400) ** (t_axis(n) / 0.25)
        place(sfx, stereo(sine(f, n) * env_exp(n, 0.002, 0.1) * 0.08, 0.5 - 0.3 * k), 22.62 + k * 0.1)
    # J/K — crachá, mãos, quebra-cabeça
    n = int(5.0 * SR)
    place(sfx, stereo(lp(pink(n), 300) * 0.01 * env_ar(n, 0.5, 0.5)), 23.2)
    n = int(1.7 * SR)
    sw = A.sweep_filter(pink(n), 2000, 7000, 'band', curve=1.0)
    place(sfx, A.np.stack([sw, sw], axis=1) / np.max(np.abs(sw)) * 0.03 * env_ar(n, 0.8, 0.3)[:, None], 25.9)
    place(sfx, stereo(A.bp(pink(int(0.7 * SR)), 300, 3000) * env_ar(int(0.7 * SR), 0.2, 0.3) * 0.04, -0.5), 27.45)
    place(sfx, whoosh(0.6, 600, 5000, peak=0.4, gain=0.12), 28.9)
    place(sfx, reverb(stereo(shimmer(0.7, 2400, 0.06, 77)), A.IR_HALL, 0.4), 28.95)
    place(sfx, whoosh(0.5, 900, 2500, peak=0.85, gain=0.06), 29.25)
    place(sfx, stereo(impact(0.5, 160, 90, body=0.25, crack=0.4, bright=6000)), 29.75)
    chord = np.zeros(int(1.4 * SR))
    for nn in ['C5', 'E5', 'G5', 'D6']:
        m = len(chord)
        chord += sine(note(nn), m) * env_exp(m, 0.005, 0.5) * 0.04
    place(sfx, reverb(stereo(chord), A.IR_HALL, 0.45), 29.78)
    place(sfx, whoosh(0.5, 3000, 500, peak=0.3, gain=0.08), 29.95)
    tt = 30.15
    while tt < 31.2:
        place(sfx, stereo(V.key_click(0.04), -0.4), tt)
        tt += rng.uniform(0.07, 0.13)
    for k in range(4):
        place(sfx, stereo(blip(1760 + k * 200, 0.08, 0.03, 0.02), 0.5), 30.4 + k * 0.25)
    # L — dois futuros
    place(sfx, whoosh(0.7, 4000, 300, peak=0.3, gain=0.14, pan0=0.8, pan1=-0.8), 31.2)
    n = int(8.6 * SR)
    warm = V.birds(8.5, 0.012, 55)
    traffic = lp(pink(n), 400) * 0.014
    place(sfx, warm[:, :] * np.array([1.0, 0.35]), 31.4)
    place(sfx, stereo(traffic * env_ar(n, 0.6, 1.0), -0.5), 31.4)
    drone = (sine(180 + 6 * np.sin(2 * np.pi * 0.5 * t_axis(n)), n) * 0.3 + bp(noise(n), 2000, 4000) * 0.3) * 0.012 * env_ar(n, 0.6, 1.0)
    place(sfx, stereo(drone, 0.6), 31.4)
    place(sfx, whoosh(0.8, 500, 1500, peak=0.5, gain=0.05, pan0=-0.5, pan1=0.5), 33.75)
    place(sfx, whoosh(0.8, 1500, 500, peak=0.5, gain=0.05, pan0=0.5, pan1=-0.5), 35.45)
    place(sfx, reverb(stereo(V.chime(0.1)), A.IR_ROOM, 0.3), 37.72)
    return sfx


def main():
    voice = A.build_voice_full(TOTAL)
    music = build_music_full()
    sfx = sfx_full()
    music = A.sidechain(music, voice, 7.0)
    v = stereo(voice)
    m = music / np.max(np.abs(music)) * A.db(-17)
    s = sfx / np.max(np.abs(sfx)) * A.db(-10)
    mix = v + m + s
    fo = int(0.6 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    mix = np.tanh(mix * 1.1) / 1.1
    sf.write('assets/audio/voice_full.wav', voice, SR, subtype='PCM_24')
    sf.write('assets/audio/mix_full_premaster.wav', mix, SR, subtype='PCM_24')
    print('peak', float(np.max(np.abs(mix))))


if __name__ == '__main__':
    main()
