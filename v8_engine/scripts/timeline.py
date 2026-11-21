"""Linha do tempo de 30 s: estados de cena, câmera e eventos (compartilhada por Blender, áudio e Remotion)."""
import math
import kin as K

ENGINE_POS = (0.0, -1.30, 0.36)      # raiz do motor no carro (eixo do virabrequim)
Y_C1 = K.cyl_info(1)[2]


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def ramp(t, t0, t1, a, b):
    return a + (b - a) * ease((t - t0) / (t1 - t0))


def seq(t, keys):
    """keys: lista (t, valor) com transições suaves (ease) entre pontos consecutivos"""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0))
    return keys[-1][1]


def bump(t, t0, t1):
    if t <= t0 or t >= t1:
        return 0.0
    return math.sin(math.pi * (t - t0) / (t1 - t0)) ** 2


EY = ENGINE_POS[1]
XRAY_OFF = EY - 0.65
XRAY_ON = EY + 0.95


def state(t):
    s = {}
    s['xray_pos'] = seq(t, [(0, XRAY_OFF), (5.0, XRAY_OFF), (6.4, XRAY_ON), (9.05, XRAY_ON), (10.0, XRAY_OFF),
                            (22.55, XRAY_OFF), (23.7, XRAY_ON), (25.0, XRAY_ON), (26.0, XRAY_OFF)])
    s['xray_amt'] = 1.0
    s['xray_edge'] = max(bump(t, 4.9, 6.5), bump(t, 8.95, 10.1), bump(t, 22.45, 23.8), bump(t, 24.9, 26.1))
    s['cut_y'] = seq(t, [(0, -0.46), (4.35, -0.46), (5.45, Y_C1), (25.15, Y_C1), (26.25, -0.46)])
    s['cut_glow'] = max(bump(t, 4.3, 5.9), bump(t, 25.1, 26.3)) * 0.8
    s['car_wipe'] = seq(t, [(0, -3.2), (4.1, -3.2), (5.6, 3.4), (25.6, 3.4), (27.3, -3.2)])
    s['front_hide'] = seq(t, [(0, 0.0), (7.2, 0.0), (7.7, 1.0), (22.45, 1.0), (22.95, 0.0)])
    s['hood_angle'] = seq(t, [(0, 0.0), (2.4, 0.0), (3.7, -52.0), (26.6, -52.0), (27.6, 0.0)])
    s['hood_hide'] = seq(t, [(0, 0.0), (3.3, 0.0), (4.1, 1.0), (26.0, 1.0), (26.6, 0.0)])
    s['engine_light'] = seq(t, [(0, 0.0), (3.0, 0.0), (5.0, 1.0), (25.6, 1.0), (27.4, 0.0)])
    s['car_light'] = seq(t, [(0, 0.25), (1.4, 1.0), (3.6, 1.0), (5.6, 0.04), (25.4, 0.04), (27.2, 1.0)])
    s['flow_vis'] = seq(t, [(0, 0.0), (9.7, 0.0), (10.0, 1.0), (22.5, 1.0), (22.8, 0.0)])
    return s


# ---------------------------------------------------------------- câmera
def E(x, y, z):
    return (ENGINE_POS[0] + x, ENGINE_POS[1] + y, ENGINE_POS[2] + z)


ax = (-math.sqrt(0.5), 0.0, math.sqrt(0.5))  # eixo do banco direito


def C1(d, dx=0.0, dy=0.0):
    """ponto no eixo do cilindro 1, a d metros do eixo do virabrequim (+ deslocamento lateral)"""
    return E(ax[0] * d + 0.7071 * dx, Y_C1 + dy, ax[2] * d + 0.7071 * dx)


# (t, posição, alvo, rolagem°, lente mm, f-stop)
CAM_KEYS = [
    (0.0, (2.35, -6.6, 0.62), (0.0, -0.75, 0.52), 0.0, 38.0, 5.6),
    (1.8, (1.75, -5.0, 1.05), (0.0, -1.05, 0.62), 0.0, 38.0, 5.6),
    (3.2, (1.05, -3.35, 1.72), (0.0, -1.38, 0.78), 0.0, 36.0, 5.6),
    (4.4, (0.62, -2.45, 1.48), E(0, -0.05, 0.22), 0.0, 36.0, 6.3),
    (5.6, E(0.78, -0.78, 0.66), E(0, -0.02, 0.12), 0.0, 36.0, 8.0),
    (6.9, E(0.50, -0.98, 0.78), E(0, 0.06, 0.10), 0.0, 32.0, 8.0),
    (8.0, E(0.16, -0.80, 0.38), E(-0.02, 0.10, 0.10), 0.0, 30.0, 8.0),
    (8.9, E(-0.02, -0.66, 0.30), C1(0.14, 0.0), 15.0, 34.0, 8.0),
    (9.75, C1(0.17, 0.02, -0.46), C1(0.175), 45.0, 42.0, 9.0),
    (12.4, C1(0.19, 0.01, -0.43), C1(0.19), 45.0, 44.0, 9.0),
    (14.7, C1(0.175, 0.0, -0.40), C1(0.175), 45.0, 46.0, 9.0),
    (15.45, C1(0.21, -0.005, -0.30), C1(0.215), 45.0, 52.0, 10.0),
    (16.3, C1(0.205, -0.005, -0.31), C1(0.205), 45.0, 52.0, 10.0),
    (18.2, C1(0.13, 0.0, -0.58), C1(0.13), 45.0, 40.0, 9.0),
    (19.6, C1(0.15, -0.02, -0.52), C1(0.15, -0.02), 45.0, 40.0, 9.0),
    (21.6, C1(0.18, -0.05, -0.50), C1(0.18, -0.045), 45.0, 40.0, 9.0),
    (22.6, C1(0.16, 0.05, -0.75), C1(0.12), 32.0, 36.0, 8.0),
    (23.9, E(0.62, -0.95, 0.80), E(0.0, 0.0, 0.10), 0.0, 32.0, 8.0),
    (25.1, E(0.92, -0.98, 0.70), E(0.0, 0.0, 0.10), 0.0, 32.0, 8.0),
    (26.4, (1.6, -3.3, 1.35), E(0, 0.15, 0.12), 0.0, 34.0, 6.3),
    (27.7, (2.55, -5.6, 0.95), (0.0, -0.55, 0.58), 0.0, 38.0, 5.6),
    (30.0, (3.05, -5.95, 0.78), (0.0, -0.45, 0.6), 0.0, 40.0, 5.6),
]


def cam_tracks():
    tr = {}
    keys = CAM_KEYS
    for i in range(3):
        tr[f'p{i}'] = K.pchip([(k[0], k[1][i]) for k in keys])
        tr[f't{i}'] = K.pchip([(k[0], k[2][i]) for k in keys])
    tr['roll'] = K.pchip([(k[0], k[3]) for k in keys])
    tr['lens'] = K.pchip([(k[0], k[4]) for k in keys])
    tr['fstop'] = K.pchip([(k[0], k[5]) for k in keys])
    return tr


def cam_at(t, tr):
    return dict(pos=tuple(tr[f'p{i}'](t) for i in range(3)), tgt=tuple(tr[f't{i}'](t) for i in range(3)),
                roll=tr['roll'](t), lens=tr['lens'](t), fstop=tr['fstop'](t))


# ---------------------------------------------------------------- narração e legendas (Remotion/áudio)
NARRATION = [
    (1.0, 'Por trás do ronco de um vê-oito, existe uma máquina de precisão.', 'Por trás do ronco de um V8, existe uma máquina de precisão.'),
    (5.25, 'Oito pistões trabalham em conjunto, transformando força em rotação.', 'Oito pistões trabalham em conjunto, transformando força em rotação.'),
    (10.15, 'Primeiro, o cilindro recebe ar e combustível. Depois, comprime essa mistura.', 'Primeiro, o cilindro recebe ar e combustível. Depois, comprime essa mistura.'),
    (15.2, 'A vela inicia a combustão, e os gases empurram o pistão com força.', 'A vela inicia a combustão, e os gases empurram o pistão com força.'),
    (20.1, 'Os gases saem pelo escape, enquanto os outros cilindros mantêm o motor girando.', 'Os gases saem pelo escape, enquanto os outros cilindros mantêm o motor girando.'),
    (25.2, 'É essa sequência de movimentos que dá vida a um motor vê-oito.', 'É essa sequência de movimentos que dá vida a um motor V8.'),
]

if __name__ == '__main__':
    tr = cam_tracks()
    for t in [0, 4.4, 5.6, 9.75, 12, 15.45, 19.6, 25, 30]:
        print(t, {k: (tuple(round(x, 3) for x in v) if isinstance(v, tuple) else round(v, 2)) for k, v in cam_at(t, tr).items()})
    print(state(5.0))
