"""Pose do mecanismo para um ângulo do virabrequim (usada no bake de keyframes e nos testes)."""
import math
from mathutils import Vector
import kin as K

D2R = math.pi / 180


def axis(b):
    a = K.BANK_ANG[b] * D2R
    return Vector((math.sin(a), 0, math.cos(a)))


def cam_lift(cam, v, theta):
    """levantamento real = função suporte do lóbulo na direção do tucho (contato came/tucho exato)"""
    phi = theta / 2.0
    f = -v['d']
    df = math.degrees(math.atan2(f.x, f.z))
    best = -1e9
    for (vv, prof) in cam['lobes']:
        if vv is not v:
            continue
        for (x, z) in prof:
            # rotaciona o ponto do perfil por phi (em torno de Y) e projeta na direção do tucho
            a = math.radians(phi)
            xr = x * math.cos(a) + z * math.sin(a)
            zr = -x * math.sin(a) + z * math.cos(a)
            h = xr * math.sin(math.radians(df)) + zr * math.cos(math.radians(df))
            if h > best:
                best = h
    return max(0.0, best - K.CAM_RB)


def pose(E, theta):
    """aplica a pose (sem keyframes). Retorna dicionário com valores calculados."""
    out = {}
    E.o['Crankshaft'].rotation_euler.y = theta * D2R
    for (b, kind), cam in E.cams.items():
        cam['obj'].rotation_euler.y = theta * D2R / 2
    for c in range(1, 9):
        b, j, y = K.cyl_info(c)
        dist = K.piston_dist(theta, c)
        p = axis(b) * dist + Vector((0, y, 0))
        E.o[f'Piston_{c}'].location = p
        out[('piston', c)] = p
    for key, v in E.valves.items():
        c, kind, ys = key
        b = K.cyl_info(c)[0]
        L = cam_lift(E.cams[(b, kind)], v, theta)
        v['obj'].location = v['S'] - v['d'] * L
        v['spring'].scale = (1, 1, (0.0315 - L) / 0.0315)
        out[('lift', key)] = L
    return out
