"""Áudio da prévia v2 (nova abertura). Reaproveita voz e trilha aprovadas; sound design novo.

Uso: python3 tools/build_audio_v2.py  ->  assets/audio/mix_prev_v2_premaster.wav
"""
import sys
import numpy as np
import soundfile as sf

sys.path.insert(0, 'tools')
import build_audio as A  # noqa: E402

SR, N, DUR = A.SR, A.N, A.DUR
rng = np.random.default_rng(77)
stereo, place, lp, hp, bp = A.stereo, A.place, A.lp, A.hp, A.bp
t_axis, env_exp, env_ar, noise, pink, sine = A.t_axis, A.env_exp, A.env_ar, A.noise, A.pink, A.sine
whoosh, blip, click, shimmer, impact, reverb = A.whoosh, A.blip, A.click, A.shimmer, A.impact, A.reverb


def buzz(n_sec=0.16, gain=0.25):
    n = int(n_sec * SR)
    t = t_axis(n)
    motor = np.sign(np.sin(2 * np.pi * 165 * t)) * 0.6 + np.sin(2 * np.pi * 330 * t) * 0.4
    rattle = bp(noise(n), 900, 2600) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 82 * t)))
    y = lp(motor, 900) + rattle * 0.25
    return y * env_ar(n, 0.01, 0.03) * gain


def chirp(f0, f1, n_sec, gain):
    n = int(n_sec * SR)
    t = t_axis(n) / n_sec
    f = f0 + (f1 - f0) * t + 400 * np.sin(2 * np.pi * 18 * t * n_sec)
    return sine(f, n) * np.sin(np.pi * t) ** 2 * gain


def birds(dur, gain=0.02, seed=3):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    tt = 0.2
    while tt < dur - 0.3:
        pan = r.uniform(-0.8, 0.8)
        for k in range(r.integers(2, 5)):
            f0 = r.uniform(2600, 4200)
            c = chirp(f0, f0 * r.uniform(0.7, 1.3), r.uniform(0.05, 0.11), gain)
            i = int((tt + k * 0.09) * SR)
            seg = stereo(c, pan)
            m = min(len(seg), n - i)
            if m > 0:
                out[i:i + m] += seg[:m]
        tt += r.uniform(0.5, 1.2)
    return out


def rustle(n_sec, gain=0.05):
    n = int(n_sec * SR)
    x = bp(pink(n), 700, 5000)
    mod = np.abs(lp(noise(n), 18)) * 6
    return x * np.clip(mod, 0, 1) * env_ar(n, 0.15, 0.25) * gain


def chime(gain=0.12):
    n = int(0.9 * SR)
    y = np.zeros(n)
    for f, d, g in [(1318.5, 0.0, 1.0), (1760.0, 0.09, 0.85)]:
        i = int(d * SR)
        m = n - i
        tone = (sine(f, m) + 0.35 * sine(f * 2.0, m) + 0.12 * sine(f * 3.01, m)) * env_exp(m, 0.003, 0.28) * g
        y[i:] += tone
    return y * gain


def key_click(gain=0.035):
    n = int(0.03 * SR)
    return (bp(noise(n), 1500, 6000) * env_exp(n, 0.0005, 0.006) + sine(rng.uniform(180, 260), n) * env_exp(n, 0.001, 0.01) * 0.3) * gain


def scribble(n_sec, gain=0.05):
    n = int(n_sec * SR)
    x = bp(noise(n), 2500, 7000)
    mod = 0.5 + 0.5 * np.sin(2 * np.pi * 9 * t_axis(n) + np.sin(2 * np.pi * 3 * t_axis(n)) * 2)
    return x * mod * env_ar(n, 0.02, 0.05) * gain


def build_sfx_v2():
    sfx = np.zeros((N, 2))
    # ambiente do quarto ao amanhecer: ar + passarinhos distantes
    n = int(2.6 * SR)
    room = lp(pink(n), 700) * 0.008 * env_ar(n, 0.05, 0.4)
    place(sfx, stereo(room), 0)
    place(sfx, birds(2.5, 0.012, 3), 0)
    # vibração do celular (duas vezes) + notificação
    place(sfx, stereo(buzz(0.16, 0.15), 0.45), 0.05)
    place(sfx, stereo(buzz(0.16, 0.15), 0.45), 0.29)
    place(sfx, stereo(buzz(0.14, 0.18), 0.4), 1.0)
    place(sfx, reverb(stereo(chime(0.13), 0.3), A.IR_ROOM, 0.25), 1.02)
    # lençol / braço se movendo
    place(sfx, stereo(rustle(0.75, 0.05), 0.3), 0.8)
    # mergulho da câmera até o celular
    place(sfx, whoosh(0.75, 300, 3200, peak=0.8, gain=0.14), 1.2)
    # toque + expansão da interface
    place(sfx, stereo(click(0.18, 3500), 0.15), 2.32)
    place(sfx, stereo(blip(880, 0.12, 0.05, 0.03), 0.1), 2.33)
    place(sfx, whoosh(0.5, 500, 6000, peak=0.35, gain=0.16), 2.34)
    place(sfx, reverb(stereo(shimmer(0.6, 2000, 0.06, 5)), A.IR_HALL, 0.4), 2.4)
    # agente chegando em cada tarefa + micro-sons das tarefas
    TN = [2.66, 2.96, 3.26, 3.56, 3.86]
    notes = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0]
    for k, tn in enumerate(TN):
        place(sfx, stereo(blip(notes[k], 0.2, 0.1, 0.05), -0.1), tn)
    for k in range(3):  # e-mails viram aviões de papel
        place(sfx, whoosh(0.22, 1500, 4500, peak=0.4, gain=0.05, pan0=-0.1, pan1=0.6), TN[0] + 0.12 + k * 0.07)
    for k in range(9):  # relatório escrevendo
        place(sfx, stereo(key_click(0.045), 0.1), TN[1] + k * 0.035)
    for k in range(8):  # planilha preenchendo
        place(sfx, stereo(blip(2000 + k * 180, 0.05, 0.035, 0.012), 0.2), TN[2] + k * 0.03)
    for k in range(5):  # agenda encaixando
        place(sfx, stereo(click(0.06, 2500), -0.2 + k * 0.1), TN[3] + 0.1 + k * 0.05)
    place(sfx, stereo(scribble(0.2, 0.05), 0.2), TN[4] + 0.12)  # assinatura
    place(sfx, stereo(impact(0.5, 120, 70, body=0.25, crack=0.15, bright=3000), 0.2), TN[4] + 0.3)
    # dobra -> tela dividida
    place(sfx, whoosh(0.45, 4000, 400, peak=0.25, gain=0.16, pan0=-0.6, pan1=0.6), 3.98)
    n = int(0.35 * SR)
    f = 2400 * (500 / 2400) ** (t_axis(n) / 0.35)
    place(sfx, stereo(sine(f, n) * env_ar(n, 0.01, 0.1) * 0.03), 4.0)
    # lado VOCÊ: digitação lenta (esquerda); lado IA: processamento rápido (direita)
    tt = 4.3
    while tt < 5.1:
        place(sfx, stereo(key_click(0.045), -0.55), tt)
        tt += rng.uniform(0.09, 0.2)
    for i in range(5):
        base = 4.45 + i * 0.11
        k = 0
        while base + k * 0.62 < 6.1:
            ts = base + k * 0.62
            place(sfx, stereo(blip(1500 + i * 220, 0.06, 0.022, 0.012), 0.55), ts)
            place(sfx, stereo(blip(2400 + i * 200, 0.06, 0.018, 0.01), 0.6), ts + RUN_DONE)
            k += 1
    # "melhor que você": pausa tensa
    place(sfx, stereo(impact(1.2, 70, 40, body=0.25, crack=0.05, bright=2000)), 5.14)
    n = int(1.0 * SR)
    tone = (sine(110, n) + 0.5 * sine(116.5, n)) * env_ar(n, 0.3, 0.4) * 0.02
    place(sfx, stereo(tone), 5.3)
    # recuo da câmera: janelas -> prédio -> cidade
    place(sfx, whoosh(1.0, 3500, 300, peak=0.25, gain=0.14), 5.98)
    place(sfx, whoosh(1.6, 200, 1200, peak=0.6, gain=0.08), 6.15)
    n = int(2.5 * SR)
    city = (lp(pink(n), 400) * 0.016 + bp(pink(n), 1500, 5000) * 0.003) * np.clip(t_axis(n) / 0.8, 0, 1)
    place(sfx, stereo(city), 6.0)
    place(sfx, birds(2.4, 0.014, 9), 6.1)
    place(sfx, whoosh(1.4, 250, 900, peak=0.5, gain=0.05, pan0=0.8, pan1=-0.8), 6.9)  # ônibus
    place(sfx, reverb(stereo(shimmer(0.7, 2400, 0.045, 13)), A.IR_HALL, 0.45), 6.95)
    # onda ciano atravessando a cidade (direita -> esquerda)
    n = int(0.9 * SR)
    sw = A.sweep_filter(pink(n), 800, 7000, 'band', curve=1.2)
    sw = sw / np.max(np.abs(sw)) * env_ar(n, 0.4, 0.3) * 0.05
    pans = np.linspace(0.8, -0.8, n)
    a = (pans + 1) * np.pi / 4
    place(sfx, np.stack([sw * np.cos(a), sw * np.sin(a)], axis=1), 7.72)
    place(sfx, reverb(stereo(shimmer(0.8, 3000, 0.04, 21), -0.3), A.IR_HALL, 0.5), 7.8)
    return sfx


RUN_DONE = 0.34


def main():
    voice = A.build_voice()
    music = A.build_music()
    sfx = build_sfx_v2()
    music = A.sidechain(music, voice, 7.0)
    v = stereo(voice)
    m = music / np.max(np.abs(music)) * A.db(-17)
    s = sfx / np.max(np.abs(sfx)) * A.db(-10)
    mix = v + m + s
    fo = int(0.25 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    mix = np.tanh(mix * 1.1) / 1.1
    sf.write('assets/audio/sfx_prev_v2.wav', s, SR, subtype='PCM_24')
    sf.write('assets/audio/mix_prev_v2_premaster.wav', mix, SR, subtype='PCM_24')
    print('peak', float(np.max(np.abs(mix))))


if __name__ == '__main__':
    main()
