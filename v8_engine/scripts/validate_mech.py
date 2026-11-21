"""Validação mecânica numérica sobre a cena animada (todos os 900 quadros).

Mede no próprio arquivo .blend (após constraints, drivers e keyframes):
  - moente no raio/ângulo corretos; biela unida ao moente e ao pino do pistão
  - pistão sobre o eixo do cilindro e nunca acima da face do bloco
  - folga válvula/pistão (sem colisão)
  - válvulas abertas somente na janela do seu tempo
  - contato came/tucho (sem penetração) com o comando girando a 1/2 rotação
Uso: blender -b build/v8_scene.blend --python scripts/validate_mech.py
"""
import bpy
import sys
import os
import math
import json
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import kin as K  # noqa: E402
import build_engine as BE  # noqa: E402

sc = bpy.context.scene
root = bpy.data.objects['ENGINE_ROOT']
inv = root.matrix_world.inverted()
D = math.radians
rep = {'frames': 0, 'crank_angle_err_deg': 0.0, 'cam_ratio_err_deg': 0.0, 'pin_on_crank_err_mm': 0.0, 'rod_joint_err_mm': 0.0,
       'piston_axis_err_mm': 0.0, 'max_crown_above_deck_mm': -1e9, 'min_valve_piston_clear_mm': 1e9,
       'valve_open_outside_window': 0, 'min_cam_bucket_gap_mm': 1e9, 'max_cam_bucket_gap_mm': -1e9}
worst = {}
# perfis dos lóbulos (geometria real da malha do comando, em coordenadas locais)
lobes = {}
for b in 'RL':
    for kind in 'IE':
        cam = bpy.data.objects[f'Cam_{b}{kind}']
        lobes[(b, kind)] = cam
eng = BE.Engine.__new__(BE.Engine)
LOBE_PTS = {}
for f in range(1, K.NFRAMES + 1):
    sc.frame_set(f)
    rep['frames'] += 1
    th = K.crank_theta(K.frame_time(f))
    crank = bpy.data.objects['Crankshaft']
    rep['crank_angle_err_deg'] = max(rep['crank_angle_err_deg'], abs(math.degrees(crank.rotation_euler.y) - th))
    for (b, kind), cam in lobes.items():
        rep['cam_ratio_err_deg'] = max(rep['cam_ratio_err_deg'], abs(math.degrees(cam.rotation_euler.y) - th / 2))
    for c in range(1, 9):
        b, j, y = K.cyl_info(c)
        a = D(K.BANK_ANG[b])
        ax = Vector((math.sin(a), 0, math.cos(a)))
        pst = bpy.data.objects[f'Piston_{c}']
        rod = bpy.data.objects[f'Rod_{c}']
        pin = bpy.data.objects[f'Pin_{c}']
        wp = inv @ pst.matrix_world.translation
        pp = inv @ pin.matrix_world.translation
        exp_pin = Vector((K.CR * math.sin(D(th + K.PIN_OFF[j])), y, K.CR * math.cos(D(th + K.PIN_OFF[j]))))
        rep['pin_on_crank_err_mm'] = max(rep['pin_on_crank_err_mm'], (pp - exp_pin).length * 1000)
        big = inv @ rod.matrix_world.translation
        small = inv @ (rod.matrix_world @ Vector((0, 0, K.ROD)))
        rep['rod_joint_err_mm'] = max(rep['rod_joint_err_mm'], max((big - pp).length, (small - wp).length) * 1000)
        off = wp - Vector((0, y, 0))
        rep['piston_axis_err_mm'] = max(rep['piston_axis_err_mm'], (off - ax * off.dot(ax)).length * 1000)
        crown = off.dot(ax) + K.COMP_H
        rep['max_crown_above_deck_mm'] = max(rep['max_crown_above_deck_mm'], (crown - K.DECK) * 1000)
        p = K.psi(th, c)
        for kind in 'IE':
            o, cl, _ = K.VALVE_EVENTS[kind]
            cam = lobes[(b, kind)]
            for ys in (-1, 1):
                v = bpy.data.objects[f'Valve_{c}{kind}{"a" if ys < 0 else "b"}']
                S, d = BE.Engine.valve_seat(eng, kind, ys, y)
                Sw = BE.bankM(b) @ S
                dw = BE.bank_dir(b, d)
                vp = inv @ v.matrix_world.translation
                lift = (Sw - vp).dot(dw)
                # janela do tempo (com 1° de tolerância)
                if lift > 0.00005 and not ((p - o) % 720 <= (cl - o) + 1.0):
                    rep['valve_open_outside_window'] += 1
                # folga válvula x pistão (face inclinada: ponto mais baixo ao longo do eixo)
                tilt = math.acos(max(-1.0, min(1.0, dw.dot(ax))))
                low = (vp - Vector((0, y, 0))).dot(ax) - K.VALVE_R[kind] * math.sin(tilt)
                clear = (low - (crown - K.RELIEF)) * 1000
                if clear < rep['min_valve_piston_clear_mm']:
                    rep['min_valve_piston_clear_mm'] = clear
                    worst['valve_piston'] = dict(frame=f, cyl=c, valve=kind, psi=round(p, 1))
                # contato came/tucho: extensão do lóbulo (malha real) na direção do tucho
                if f % 3 == 0:
                    cmw = inv @ cam.matrix_world
                    fdir = -dw
                    yv = vp.y
                    key = (cam.name, round(yv, 4))
                    if key not in LOBE_PTS:
                        LOBE_PTS[key] = [Vector((vv.co.x, 0, vv.co.z)) for vv in cam.data.vertices if abs(vv.co.y - yv) < 0.0075]
                    R3 = cmw.to_3x3()
                    best = max((R3 @ q).dot(fdir) for q in LOBE_PTS[key])
                    camc = cmw @ Vector((0, yv, 0))
                    bucket_top = vp + dw * K.BUCKET_TOP
                    gap = ((camc - bucket_top).dot(dw) - best) * 1000
                    rep['min_cam_bucket_gap_mm'] = min(rep['min_cam_bucket_gap_mm'], gap)
                    rep['max_cam_bucket_gap_mm'] = max(rep['max_cam_bucket_gap_mm'], gap)
rep = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in rep.items()}
rep['worst'] = worst
out = os.path.join(os.path.dirname(bpy.data.filepath), 'mech_validation.json')
json.dump(rep, open(out, 'w'), indent=1)
print('MECH', json.dumps(rep))
