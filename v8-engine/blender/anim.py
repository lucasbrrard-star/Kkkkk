"""Per-frame animation baking + overlay data export."""
import os
import math
import json
import bpy
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
from v8kin import *   # noqa: F401,F403
import build_engine as be
import camera as cam

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'render')
FR = list(range(1, NF + 1))
E = cam.E


def fc_set(idb, path, index, values, interp=1):
    if idb.animation_data is None:
        idb.animation_data_create()
    ad = idb.animation_data
    if ad.action is None:
        ad.action = bpy.data.actions.new(idb.name + '_act')
    fc = ad.action.fcurve_ensure_for_datablock(idb, path, index=index)
    while len(fc.keyframe_points):
        fc.keyframe_points.remove(fc.keyframe_points[0], fast=True)
    n = len(values)
    fc.keyframe_points.add(n)
    co = []
    for i, v in enumerate(values):
        co += [FR[i], float(v)]
    fc.keyframe_points.foreach_set('co', co)
    fc.keyframe_points.foreach_set('interpolation', [interp] * n)
    fc.update()
    return fc


def ss(e0, e1, x):
    if e1 == e0:
        return 1.0 if x >= e1 else 0.0
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def env(f, a0, a1, b0, b1):
    """0 before a0, ramps to 1 by a1, stays, ramps to 0 from b0 to b1."""
    return ss(a0, a1, f) * (1 - ss(b0, b1, f))


def lerp(a, b, t):
    return a + (b - a) * t


# ----------------------------------------------------------------------------
# Section/ghost controller schedule (engine coords)
Y_CUT = be.Y_CUT
G_FRONT_NONE, G_ALL = -0.6, 0.66


def ctl_values(f):
    # e_gpos: ghost where y < e_gpos
    if f < 116:
        g = G_FRONT_NONE
    elif f < 148:
        g = lerp(-0.42, G_ALL, ss(116, 148, f))
    elif f < 280:
        g = G_ALL
    elif f < 312:
        g = lerp(G_ALL, -0.45, ss(280, 312, f))
    elif f < 666:
        g = -0.45
    elif f < 668:
        g = Y_CUT + 0.004
    elif f < 704:
        g = lerp(Y_CUT + 0.004, G_ALL, ss(670, 704, f))
    elif f < 760:
        g = G_ALL
    elif f < 796:
        g = lerp(G_ALL, -0.45, ss(760, 796, f))
    else:
        g = G_FRONT_NONE
    e_front = 1 - env(f, 299, 307, 667, 680)
    e_sect = env(f, 300, 303, 665, 667)
    # car ghost: x-ray where y < c_gpos
    c = lerp(-2.45, 2.6, ss(58, 122, f)) if f < 800 else lerp(2.6, -2.45, ss(805, 868, f))
    if f < 58:
        c = -3.0
    if f > 868:
        c = -3.0
    c_vis = 1 - env(f, 150, 176, 762, 800)
    return dict(e_gpos=g, e_front=e_front, e_sect=e_sect, c_gpos=c, e_glow=1.0, c_glow=1.0, c_vis=c_vis)


# ----------------------------------------------------------------------------
MIX_COL = (0.22, 0.52, 1.0)
CMP_COL = (0.45, 0.75, 1.0)
EXH_COL = (0.38, 0.35, 0.33)


def gas_state(ph):
    """Returns col, den, emcol, em, flame_r, flame_em for cycle angle ph."""
    ph %= 720.0
    if ph < 180:
        t = ph / 180
        return MIX_COL, 6 + 8 * t, (0.3, 0.6, 1.0), 0.12 + 0.1 * t, -1.0, 0.0
    if ph < 345:
        t = (ph - 180) / 165
        col = tuple(lerp(a, b, t) for a, b in zip(MIX_COL, CMP_COL))
        return col, 14 + 16 * t * t, (0.4, 0.7, 1.0), 0.22 + 0.35 * t * t, -1.0, 0.0
    if ph < 540:
        p = (ph - 345) / 23.0
        r = 0.078 * min(1.0, max(0.0, p)) ** 0.75 if p < 1.6 else 1.0
        fem = 5.0 * math.exp(-max(0.0, ph - 368) / 55.0) + 0.4 * (1 - (ph - 345) / 195)
        den = lerp(30, 9, min(1.0, (ph - 345) / 120))
        t = (ph - 345) / 195
        col = tuple(lerp(a, b, t) for a, b in zip((1.0, 0.5, 0.15), EXH_COL))
        return col, den, (1.0, 0.45, 0.12), 0.15 * (1 - t), r, fem
    t = (ph - 540) / 180
    return EXH_COL, lerp(12, 3.0, t), (1.0, 0.4, 0.1), 0.25 * (1 - t) ** 2, -1.0, 0.0


def animate(sc, D, test=False):
    Eng = D['E']
    P = Eng.parts
    root = D['root']
    th = [theta_frame(f) for f in FR]
    rad = [math.radians(t) for t in th]
    # --- crank, nose, pulleys
    fc_set(P['crank'], 'rotation_euler', 1, rad)
    fc_set(P['crank_nose'], 'rotation_euler', 1, rad)
    accr = Eng.acc
    for key, obj in (('damper', P['damper']), ('wp', P['wp_pulley']), ('alt', P['alt_pulley']),
                     ('idler', P['idler']), ('tens', P['tens'])):
        obj.rotation_mode = 'ZYX'
        ratio = accr['damper'][2] / accr[key][2]
        fc_set(obj, 'rotation_euler', 2, [-r * ratio for r in rad])
    # --- pistons / rods
    for c in CYLS:
        pp = [piston_pin_pos(c, t) for t in th]
        cp = [crankpin_pos(c, t) for t in th]
        for i in (0, 2):
            fc_set(P['pistons'][c], 'location', i, [p[i] for p in pp])
            fc_set(P['rods'][c], 'location', i, [p[i] for p in cp])
        P['pistons'][c].location.y = cyl_y(c)
        P['rods'][c].location.y = cyl_y(c)
        fc_set(P['rods'][c], 'rotation_euler', 1, [rod_angle(c, t) for t in th])
    # --- cams (+ drive gears)
    for (s, kind), o in P['cams'].items():
        K = P['cam_K'][s]
        vals = [r / 2 for r in rad] if kind == 'in' else [-r / 2 + K for r in rad]
        fc_set(o, 'rotation_euler', 1, vals)
        fc_set(P['cam_drive'][(s, kind)], 'rotation_euler', 1, vals)
    # --- valves + springs
    lifts = {}
    for c in CYLS:
        for kind in ('in', 'ex'):
            a = Vector(valve_axis(c, kind))
            seat = Vector(valve_seat(c, kind))
            lf = [valve_lift(c, kind, t) for t in th]
            lifts[(c, kind)] = lf
            v = P['valves'][(c, kind)]
            fc_set(v, 'location', 0, [seat.x - a.x * l for l in lf])
            fc_set(v, 'location', 2, [seat.z - a.z * l for l in lf])
            fc_set(P['springs'][(c, kind)], 'scale', 2, [(0.040 - l) / 0.040 for l in lf])
    # --- chains
    for s, (cur, length) in D['chains'].items():
        ident = D['chain_ng'].interface.items_tree['Offset'].identifier
        # offset must be continuous (no modulo jumps) for motion blur
        fc_set(cur, f'modifiers["GN"].properties.inputs.{ident}.value', 0, [-(r * be.R_CRANK_SPR) for r in rad])
    # --- controllers
    ng = bpy.data.node_groups['CTL']
    cv = [ctl_values(f) for f in FR]
    for k in ('e_gpos', 'e_front', 'e_sect', 'c_gpos', 'e_glow', 'c_glow', 'c_vis'):
        fc_set(ng, f'nodes["{k}"].outputs[0].default_value', 0, [v[k] for v in cv])
    # GN chain instances cannot read the host's isfront prop -> toggle visibility
    for s_, (cur, length) in D['chains'].items():
        fc_set(cur, 'hide_render', 0, [0 if v['e_front'] > 0.5 else 1 for v in cv], interp=0)
    # car fully gone while the camera is inside the engine (also saves render time)
    car_hide = [1 if v['c_vis'] < 0.002 else 0 for v in cv]
    for o in bpy.data.collections['CAR'].all_objects:
        fc_set(o, 'hide_render', 0, [h if not o.hide_render else 1 for h in car_hide], interp=0)
    # --- gases
    hero_window = [env(f, 296, 300, 668, 672) for f in FR]   # section mode
    g_env = [env(f, 112, 140, 786, 806) for f in FR]
    for c in CYLS:
        tip = E + Vector(P['plug_tips'][c])
        states = [gas_state(phi(c, t)) for t in th]
        U = Vector(bank_U(c))
        gaps = [max(0.0004, DECK - (piston_s(c, t) + CH) - 0.0004) for t in th]
        for vname, (ob, od) in P['gas'][c].items():
            if c in (1, 2):
                vis = [hero_window[i] if vname == 'half' else 1 - hero_window[i] for i in range(NF)]
            else:
                vis = [1 - hero_window[i] for i in range(NF)]
            fc_set(ob, 'scale', 2, gaps)
            for o in (ob, od):
                o['plug'] = tuple(tip)
                o['gas_col'] = (0.5, 0.5, 0.5)
                o['gas_em_col'] = (0.5, 0.5, 0.5)
                for k in ('gas_den', 'gas_em', 'flame_r', 'flame_em'):
                    o[k] = 0.0
                m = [vis[i] * g_env[i] for i in range(NF)]
                for j in range(3):
                    fc_set(o, '["gas_col"]', j, [st[0][j] for st in states])
                    fc_set(o, '["gas_em_col"]', j, [st[2][j] for st in states])
                fc_set(o, '["gas_den"]', 0, [st[1] * m[i] for i, st in enumerate(states)])
                fc_set(o, '["gas_em"]', 0, [st[3] * m[i] for i, st in enumerate(states)])
                fc_set(o, '["flame_r"]', 0, [st[4] for st in states])
                fc_set(o, '["flame_em"]', 0, [st[5] * m[i] for i, st in enumerate(states)])
                fc_set(o, 'hide_render', 0, [0 if m[i] > 0.001 else 1 for i in range(NF)], interp=0)
    # --- sparks + flame light
    for c, o in D['sparks'].items():
        vals = []
        for i, t in enumerate(th):
            p = phi(c, t)
            on = 1.0 if 343.0 <= p <= 352.0 else 0.0
            vals.append(on * (0.75 + 0.25 * math.sin(FR[i] * 2.3)) * g_env[i])
        fc_set(o, '["spark"]', 0, vals)
    fl = D['elights']['flame'].data
    fvals = []
    for i, t in enumerate(th):
        p = phi(1, t)
        e = 0.0
        if 343 <= p <= 540:
            e = 0.6 if p < 345 else 6.0 * math.exp(-max(0.0, p - 368) / 50.0) * ss(345, 352, p)
        fvals.append(e * hero_window[i])
    fc_set(fl, 'energy', 0, fvals)
    # --- particle streams (cylinder 1)
    sng = D['stream_ng']
    idp, ida = gn_id(sng, 'Phase'), gn_id(sng, 'Amount')
    win_in = [env(f, 300, 310, 470, 480) for f in FR]
    win_ex = [env(f, 560, 575, 690, 705) for f in FR]
    li, le = lifts[(1, 'in')], lifts[(1, 'ex')]
    for name, lf, win, speed in (('air', li, win_in, 0.55), ('exh', le, win_ex, 0.6)):
        ph, acc, amt = [], 0.0, []
        for i in range(NF):
            n = lf[i] / 0.009
            acc += speed * n / FPS
            ph.append(acc)
            amt.append(ss(0.03, 0.3, n) * win[i])
        cur = D['streams'][name]
        fc_set(cur, f'modifiers["GN"].properties.inputs.{idp}.value', 0, ph)
        fc_set(cur, f'modifiers["GN"].properties.inputs.{ida}.value', 0, amt)
    ph, acc, amt = [], 0.0, []
    for i, t in enumerate(th):
        p = phi(1, t)
        acc += 1.2 / FPS
        ph.append(acc)
        amt.append(env(p if p < 400 else -1, 2, 15, 120, 150) * win_in[i])
    fc_set(D['streams']['fuel'], f'modifiers["GN"].properties.inputs.{idp}.value', 0, ph)
    fc_set(D['streams']['fuel'], f'modifiers["GN"].properties.inputs.{ida}.value', 0, amt)
    # --- lights
    L = D['studio']
    base = {'top': 650, 'stripL': 420, 'stripR': 300, 'rim': 320, 'kick': 60}
    dim = [1 - 0.85 * env(f, 140, 178, 765, 805) for f in FR]
    sdim = [1 - 0.7 * env(f, 78, 110, 790, 830) for f in FR]   # strips off while looking into the bay
    fc_set(L['top'].data, 'energy', 0, [base['top'] * ss(8, 50, f) * dim[i] for i, f in enumerate(FR)])
    fc_set(L['stripL'].data, 'energy', 0, [base['stripL'] * ss(1, 30, f) * dim[i] * sdim[i] for i, f in enumerate(FR)])
    fc_set(L['stripR'].data, 'energy', 0, [base['stripR'] * ss(10, 40, f) * dim[i] * sdim[i] for i, f in enumerate(FR)])
    fc_set(L['rim'].data, 'energy', 0, [base['rim'] * (0.35 + 0.65 * ss(1, 25, f)) * dim[i] for i, f in enumerate(FR)])
    fc_set(L['kick'].data, 'energy', 0, [base['kick'] * ss(25, 60, f) for f in FR])
    fc_set(L['stripL'], 'location', 1, [lerp(-3.6, -0.3, ss(1, 75, f)) for f in FR])
    fc_set(L['stripR'], 'location', 1, [lerp(1.8, -0.3, ss(1, 75, f)) for f in FR])
    EL = D['elights']
    for k, e0 in (('ekey', 18), ('efill', 8), ('etop', 12), ('erim', 14)):
        fc_set(EL[k].data, 'energy', 0, [e0 * env(f, 92, 125, 805, 835) for f in FR])
    for k, e0 in (('skey', 3.5), ('sfill', 1.8)):
        fc_set(EL[k].data, 'energy', 0, [e0 * env(f, 288, 305, 660, 690) for f in FR])
    # --- camera
    camob = setup_camera(sc)
    poses = [cam.pose(f) for f in FR]
    for j in range(3):
        fc_set(camob, 'location', j, [p[0][j] for p in poses])
    prev = None
    eul = []
    for p in poses:
        e = p[2].to_euler('XYZ', prev) if prev is not None else p[2].to_euler('XYZ')
        eul.append(e)
        prev = e
    for j in range(3):
        fc_set(camob, 'rotation_euler', j, [e[j] for e in eul])
    fc_set(camob.data, 'lens', 0, [p[3] for p in poses])
    fc_set(camob.data, 'dof.aperture_fstop', 0, [p[4] for p in poses])
    fc_set(camob.data, 'dof.focus_distance', 0, [(p[1] - p[0]).length for p in poses])
    export_overlay(sc, camob, D, th, poses, lifts)


def gn_id(ng, name):
    return ng.interface.items_tree[name].identifier


def setup_camera(sc):
    cd = bpy.data.cameras.new('Cam')
    cd.sensor_fit = 'VERTICAL'
    cd.sensor_height = 36.0
    cd.sensor_width = 36.0
    cd.clip_start = 0.01
    cd.clip_end = 100
    cd.dof.use_dof = True
    cd.dof.aperture_blades = 7
    ob = bpy.data.objects.new('Camera', cd)
    bpy.context.scene.collection.objects.link(ob)
    sc.camera = ob
    return ob


def export_overlay(sc, camob, D, th, poses, lifts):
    """Screen-space anchors (0..1, origin top-left) + engine state per frame."""
    P = D['E'].parts
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
    frames = []
    a_in1, a_ex1 = Vector(valve_axis(1, 'in')), Vector(valve_axis(1, 'ex'))
    s_in1, s_ex1 = Vector(valve_seat(1, 'in')), Vector(valve_seat(1, 'ex'))
    for i, f in enumerate(FR):
        t = th[i]
        pos, tgt, rot, lens, fs = poses[i]
        camob.data.lens = lens
        camob.matrix_world = Matrix.Translation(pos) @ rot.to_4x4()
        U1 = Vector(bank_U(1))
        pts = {
            'piston1': E + Vector(piston_pin_pos(1, t)) + U1 * CH,
            'pin1': E + Vector(piston_pin_pos(1, t)),
            'crankpin1': E + Vector(crankpin_pos(1, t)),
            'crank_c': E + Vector((0, cyl_y(1), 0)),
            'crank_mid': E + Vector((0, 0.0, -0.02)),
            'intake_v1': E + s_in1 - a_in1 * lifts[(1, 'in')][i] + a_in1 * 0.03,
            'exhaust_v1': E + s_ex1 - a_ex1 * lifts[(1, 'ex')][i] + a_ex1 * 0.03,
            'plug1': E + Vector(P['plug_tips'][1]) + U1 * 0.012,
            'runner1': E + D['E'].runner_paths[1][12],
            'header1': E + D['E'].header_paths[1][10],
            'cam_in1': E + Vector(cam_centre(1, 'in')),
            'cam_ex1': E + Vector(cam_centre(1, 'ex')),
            'hood': Vector((0, -1.5, 0.95)),
        }
        for c in CYLS:
            pts[f'crown{c}'] = E + Vector(piston_pin_pos(c, t)) + Vector(bank_U(c)) * CH
            pts[f'rodmid{c}'] = E + (Vector(piston_pin_pos(c, t)) + Vector(crankpin_pos(c, t))) * 0.5
        rec = {'f': f, 'theta': round(t, 3), 'phi': {c: round(phi(c, t), 2) for c in CYLS}}
        scr = {}
        for k, w in pts.items():
            v = world_to_camera_view(sc, camob, w)
            scr[k] = [round(v.x, 5), round(1 - v.y, 5), round(v.z, 4)]
        rec['p'] = scr
        rec['lift_in1'] = round(lifts[(1, 'in')][i] * 1000, 3)
        rec['lift_ex1'] = round(lifts[(1, 'ex')][i] * 1000, 3)
        frames.append(rec)
    os.makedirs(OUT, exist_ok=True)
    json.dump({'fps': FPS, 'frames': frames, 'firing': FIRING}, open(os.path.join(OUT, 'overlay.json'), 'w'))
    print('overlay.json written')
