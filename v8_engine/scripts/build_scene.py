"""Monta a cena completa (carro + V8 + estúdio + animação + câmera) e salva build/v8_scene.blend.

Uso: blender -b --python scripts/build_scene.py -- [--res 540x960] [--spp 16]
"""
import bpy
import sys
import os
import math
import json
import time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kin as K  # noqa: E402
import geo as G  # noqa: E402
import mats as MT  # noqa: E402
import build_engine as BE  # noqa: E402
import rig  # noqa: E402
import timeline as TL  # noqa: E402
from bpy_extras import anim_utils  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..'))
BUILD = os.path.join(ROOT, 'build')
os.makedirs(BUILD, exist_ok=True)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


RES = [int(x) for x in arg('--res', '540x960').split('x')]
SPP = int(arg('--spp', '16'))
N = K.NFRAMES
TIMES = [K.frame_time(f) for f in range(1, N + 1)]


# ---------------------------------------------------------------- keyframes em lote
def bake(idb, path, values, index=-1, interp='LINEAR'):
    """grava um keyframe por quadro (1..N) num F-Curve"""
    idb.keyframe_insert(path, index=index, frame=1)
    ad = idb.animation_data
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    fc = cb.fcurves.find(path, index=max(index, 0))
    kp = fc.keyframe_points
    kp.clear()
    kp.add(len(values))
    co = []
    for i, v in enumerate(values):
        co += [i + 1, float(v)]
    kp.foreach_set('co', co)
    ip = {'CONSTANT': 0, 'LINEAR': 1, 'BEZIER': 2}[interp]
    kp.foreach_set('interpolation', [ip] * len(values))
    fc.update()
    return fc


def bake_vec(idb, path, vecs, interp='LINEAR'):
    for i in range(3):
        bake(idb, path, [v[i] for v in vecs], i, interp)


# ---------------------------------------------------------------- carro
def load_car(col):
    path = os.path.join(MT.BK, 'blend', 'fdb71593.blend')
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = src.objects
    objs = [o for o in dst.objects if o]
    for o in objs:
        col.objects.link(o)
    root = [o for o in objs if o.parent is None and o.type == 'EMPTY'][0]
    # materiais do carro: dissolve frente->trás (car_wipe) + propriedade 'hide' por objeto (capô)
    done = set()
    for o in objs:
        if o.type != 'MESH':
            continue
        for s in o.material_slots:
            if s.material and s.material.name not in done:
                MT.wrap_fade(s.material, 'car_wipe', 'hide')
                done.add(s.material.name)
    # capô + peças apoiadas nele
    dg = bpy.context.evaluated_depsgraph_get()

    def bbox(o):
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        vs = [o.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        if not vs:
            return None
        return (Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)]))
    hood = bpy.data.objects['maska']
    hb = bbox(hood)
    hood_parts = [hood]
    for o in objs:
        if o.type != 'MESH' or o is hood:
            continue
        b = bbox(o)
        if b is None:
            continue
        mn, mx = b
        if mn.z > 0.70 and mn.y > hb[0].y - 0.02 and mx.y < hb[1].y + 0.02 and mx.y < -0.6 and abs(mn.x) < 0.9:
            # dentro da área do capô e acima da linha da carroceria
            if mx.z < hb[1].z + 0.05 and (mx.y - mn.y) < 1.6:
                hood_parts.append(o)
    hinge = bpy.data.objects.new('HoodHinge', None)
    col.objects.link(hinge)
    hinge.location = (0, hb[1].y - 0.03, hb[1].z - 0.035)
    bpy.context.view_layer.update()
    for o in hood_parts:
        mw = o.matrix_world.copy()
        o.parent = hinge
        o.matrix_parent_inverse = hinge.matrix_world.inverted()
        o.matrix_world = mw
        o['hide'] = 0.0
    print('hood parts', [o.name for o in hood_parts], 'hinge', tuple(hinge.location))
    # forro do cofre (escuro) para não ver através da carroceria
    bay = []
    bay.append(G.box((-0.62, -0.80, 0.10), (0.62, -0.74, 0.80)))      # parede corta-fogo
    for sx in (-1, 1):
        bay.append(G.box((sx * 0.60 - 0.03, -2.0, 0.30), (sx * 0.60 + 0.03, -0.78, 0.74)))  # paralamas internos
    bm = G.join_meshes(bay, 'EngineBay')
    bo = G.new_obj('EngineBay', bm, col)
    mbay = MT.principled('M_bay', (0.006, 0.006, 0.007), 0.0, 0.75)
    mbay.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = 0.15
    MT.wrap_fade(mbay, 'car_wipe', 'hide')
    bm.materials.append(mbay)
    return root, hinge, hood_parts, objs + [bo]


# ---------------------------------------------------------------- estúdio
def studio(col):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Studio')
    sc.world = w
    nt = w.node_tree
    nt.nodes.clear()
    out = MT.node(nt, 'ShaderNodeOutputWorld', (600, 0))
    env = MT.node(nt, 'ShaderNodeTexEnvironment', (-400, 100))
    env.image = bpy.data.images.load(os.path.join(MT.BK, 'hdr', '65fe1eca.exr'))
    mp = MT.node(nt, 'ShaderNodeMapping', (-600, 100))
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(35))
    tc = MT.node(nt, 'ShaderNodeTexCoord', (-800, 100))
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    bg = MT.node(nt, 'ShaderNodeBackground', (-100, 100))
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.22
    # fundo visto pela câmera: gradiente grafite muito escuro
    bg2 = MT.node(nt, 'ShaderNodeBackground', (-100, -150))
    grad = MT.node(nt, 'ShaderNodeSeparateXYZ', (-600, -200))
    nt.links.new(tc.outputs['Generated'], grad.inputs[0])
    ramp = MT.node(nt, 'ShaderNodeValToRGB', (-400, -200))
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.004, 0.0045, 0.0055, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.010, 0.013, 0.02, 1)
    nt.links.new(grad.outputs['Z'], ramp.inputs[0])
    nt.links.new(ramp.outputs['Color'], bg2.inputs['Color'])
    lp = MT.node(nt, 'ShaderNodeLightPath', (-100, 350))
    mx = MT.node(nt, 'ShaderNodeMixShader', (300, 0))
    nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0])
    nt.links.new(bg.outputs[0], mx.inputs[1])
    nt.links.new(bg2.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    # piso: preto brilhante com queda radial
    fl = G.new_obj('Floor', G.box((-30, -30, -0.02), (30, 30, 0.0)), col)
    m = MT.principled('M_floor', (0.010, 0.010, 0.012), 0.0, 0.22)
    fnt = m.node_tree
    p = fnt.nodes.get('Principled BSDF')
    geo = MT.node(fnt, 'ShaderNodeNewGeometry', (-900, 0))
    vm = MT.node(fnt, 'ShaderNodeVectorMath', (-700, 0))
    vm.operation = 'DISTANCE'
    vm.inputs[1].default_value = (0, -1.0, 0)
    fnt.links.new(geo.outputs['Position'], vm.inputs[0])
    mr = MT.node(fnt, 'ShaderNodeMapRange', (-500, 0))
    mr.inputs['From Min'].default_value = 2.5
    mr.inputs['From Max'].default_value = 11.0
    mr.inputs['To Min'].default_value = 0.5
    mr.inputs['To Max'].default_value = 0.0
    fnt.links.new(vm.outputs['Value'], mr.inputs['Value'])
    fnt.links.new(mr.outputs['Result'], p.inputs['Specular IOR Level'])
    nz = MT.node(fnt, 'ShaderNodeTexNoise', (-700, -300))
    nz.inputs['Scale'].default_value = 4.0
    mr2 = MT.node(fnt, 'ShaderNodeMapRange', (-500, -300))
    mr2.inputs['To Min'].default_value = 0.16
    mr2.inputs['To Max'].default_value = 0.32
    fnt.links.new(nz.outputs['Fac'], mr2.inputs['Value'])
    fnt.links.new(mr2.outputs['Result'], p.inputs['Roughness'])
    fl.data.materials.append(m)

    def area(name, loc, target, size, energy, color, shape='RECTANGLE', size_y=None):
        L = bpy.data.lights.new(name, 'AREA')
        L.shape = shape
        L.size = size
        if size_y:
            L.size_y = size_y
        L.energy = energy
        L.color = color
        o = bpy.data.objects.new(name, L)
        col.objects.link(o)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o
    EP = Vector(TL.ENGINE_POS)
    lights = {
        'car': [
            (area('L_top', (0, -0.4, 3.9), (0, -0.4, 0), 4.2, 1300, (1.0, 0.98, 0.95), size_y=1.3), 1300),
            (area('L_key', (3.8, -5.2, 2.4), (0, -0.8, 0.5), 2.2, 700, (1.0, 0.95, 0.9)), 700),
            (area('L_rimR', (-3.4, 1.4, 1.5), (0, 0, 0.6), 0.5, 650, (0.55, 0.72, 1.0), size_y=3.6), 650),
            (area('L_rimL', (3.2, 2.8, 1.3), (0, 0, 0.6), 0.5, 420, (0.55, 0.72, 1.0), size_y=3.0), 420),
            (area('L_front', (-2.2, -4.6, 2.2), (0, -2.0, 0.5), 1.2, 110, (0.6, 0.75, 1.0)), 110),
        ],
        'engine': [
            (area('E_key', tuple(EP + Vector((0.85, -1.0, 0.9))), tuple(EP + Vector((0, 0, 0.15))), 0.7, 16, (1.0, 0.95, 0.9)), 16),
            (area('E_rim', tuple(EP + Vector((-0.8, 0.7, 0.7))), tuple(EP + Vector((0, 0, 0.1))), 0.25, 30, (0.55, 0.72, 1.0), size_y=1.1), 30),
            (area('E_top', tuple(EP + Vector((-0.3, 0.3, 1.25))), tuple(EP + Vector((0, 0, 0))), 0.9, 7, (1.0, 0.98, 0.96), size_y=0.45), 7),
            (area('E_sec', tuple(EP + Vector((-0.55, -0.75, 0.45))), tuple(EP + Vector((-0.13, TL.Y_C1, 0.15))), 0.35, 2.5, (0.9, 0.94, 1.0)), 2.5),
            (area('E_secR', tuple(EP + Vector((0.3, -0.7, -0.05))), tuple(EP + Vector((-0.13, TL.Y_C1, 0.1))), 0.3, 1.2, (0.5, 0.68, 1.0)), 1.2),
        ],
    }
    return lights


# ---------------------------------------------------------------- principal
def main():
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = K.FPS
    sc.frame_start = 1
    sc.frame_end = N
    c_car = bpy.data.collections.new('CAR')
    c_eng = bpy.data.collections.new('ENGINE')
    c_std = bpy.data.collections.new('STUDIO')
    for c in (c_car, c_eng, c_std):
        sc.collection.children.link(c)
    car_root, hinge, hood_parts, car_objs = load_car(c_car)
    root = bpy.data.objects.new('ENGINE_ROOT', None)
    c_eng.objects.link(root)
    root.location = TL.ENGINE_POS
    bpy.context.view_layer.update()
    E = BE.Engine(root, c_eng).build()
    print('engine built', time.time() - t0)
    # corte técnico (booleana animada)
    cutter = G.new_obj('SectionCutter', G.box((-2, -2, -2), (2, 0, 2)), c_eng, root)
    cutter.data.materials.append(E.M['cut'])
    cutter.hide_render = True
    cutter.display_type = 'WIRE'
    for o in E.static:
        if o.type != 'MESH':
            continue
        m = o.modifiers.new('section', 'BOOLEAN')
        m.object = cutter
        m.solver = 'EXACT'
        m.use_hole_tolerant = True
        m.material_mode = 'TRANSFER'
        m.show_viewport = False
    for o in bpy.data.objects:
        for m in o.modifiers:
            if m.type in ('BEVEL', 'SUBSURF', 'WEIGHTED_NORMAL'):
                m.show_viewport = False
    lights = studio(c_std)
    # luzes da combustão (cilindro 1)
    Lf = bpy.data.lights.new('P_flame', 'POINT')
    Lf.color = (1.0, 0.45, 0.12)
    Lf.shadow_soft_size = 0.012
    pf = bpy.data.objects.new('P_flame', Lf)
    c_eng.objects.link(pf)
    pf.parent = root
    pf.location = BE.bank_pt('R', 0, TL.Y_C1 - 0.03, K.DECK - 0.004)
    Ls = bpy.data.lights.new('P_spark', 'POINT')
    Ls.color = (0.6, 0.78, 1.0)
    Ls.shadow_soft_size = 0.002
    ps = bpy.data.objects.new('P_spark', Ls)
    c_eng.objects.link(ps)
    ps.parent = root
    ps.location = E.plug_tips[1] - BE.bank_dir('R', (0, 0, 1)) * 0.003 + Vector((0, -0.02, 0))

    # ------------------------------------------------------------ cálculo por quadro
    print('baking...')
    theta = [K.crank_theta(t) for t in TIMES]
    events = K.spark_events()
    bake(E.o['Crankshaft'], 'rotation_euler', [th * math.pi / 180 for th in theta], 1)
    # comandos e correias via drivers (meia rotação)
    crank = E.o['Crankshaft']
    for (b, kind), cam in E.cams.items():
        fc = cam['obj'].driver_add('rotation_euler', 1)
        dr = fc.driver
        dr.type = 'SCRIPTED'
        v = dr.variables.new()
        v.name = 'r'
        v.type = 'SINGLE_PROP'
        v.targets[0].id = crank
        v.targets[0].data_path = 'rotation_euler[1]'
        dr.expression = 'r * 0.5'
    for b, bo in E.belt_objs.items():
        fc = bo.driver_add('["belt_off"]')
        dr = fc.driver
        dr.type = 'SCRIPTED'
        v = dr.variables.new()
        v.name = 'r'
        v.type = 'SINGLE_PROP'
        v.targets[0].id = crank
        v.targets[0].data_path = 'rotation_euler[1]'
        dr.expression = '-r * 3.171'
    # pistões
    for c in range(1, 9):
        b, j, y = K.cyl_info(c)
        axv = rig.axis(b)
        bake_vec(E.o[f'Piston_{c}'], 'location', [axv * K.piston_dist(th, c) + Vector((0, y, 0)) for th in theta])
    # válvulas (levantamento pelo contato real came/tucho)
    lifts_I1 = None
    for key, v in E.valves.items():
        c, kind, ys = key
        b = K.cyl_info(c)[0]
        cam = E.cams[(b, kind)]
        L = [rig.cam_lift(cam, v, th) for th in theta]
        bake_vec(v['obj'], 'location', [v['S'] - v['d'] * l for l in L])
        bake(v['spring'], 'scale', [(0.0315 - l) / 0.0315 for l in L], 2)
        if key == (1, 'I', -1):
            lifts_I1 = L
        if key == (1, 'E', -1):
            lifts_E1 = L
    print('valves baked', time.time() - t0)
    # gases
    plugw = {c: list(root.matrix_world @ E.plug_tips[c]) for c in range(1, 9)}
    gas_series = {c: [K.gas_state(th, c) for th in theta] for c in range(1, 9)}
    for c in range(1, 9):
        gs = gas_series[c]
        col, roof = E.gas[c]
        bake(col, 'scale', [max(2e-4, g['gap']) for g in gs], 2)
        for o in (col, roof):
            o['plug_pos'] = plugw[c]
            for k, src in [('gas_fresh', 'fresh'), ('gas_hot', 'hot'), ('gas_burned', 'burned'), ('gas_bright', 'bright'),
                           ('flame_r', 'flame_r'), ('flame_front', 'flame_front')]:
                bake(o, f'["{k}"]', [g[src] for g in gs])
        sp = [K.spark_intensity(t, c, events) for t in TIMES]
        bake(E.sparks[c], '["spark"]', sp)
        if c == 1:
            bake(ps.data, 'energy', [0.5 * s for s in sp])
            bake(pf.data, 'energy', [0.55 * g['hot'] * (0.5 + 0.5 * min(1.0, g['flame_r'] / 0.05)) for g in gs])
    # fluxos do cilindro 1
    st = [TL.state(t) for t in TIMES]
    for kind, Ls_, Lmax in (('I', lifts_I1, K.VALVE_EVENTS['I'][2]), ('E', lifts_E1, K.VALVE_EVENTS['E'][2])):
        amt = []
        off = []
        acc = 0.0
        for i, t in enumerate(TIMES):
            l = Ls_[i] / Lmax
            a = min(1.0, l / 0.25) * st[i]['flow_vis']
            amt.append(a)
            acc += (1 / K.FPS) * 14.0 * (0.45 + 1.1 * l) * (1.0 if kind == 'I' else 1.25)
            off.append(acc)
        for k, o in enumerate(E.flows[kind]):
            bake(o, '["flow_amt"]', amt)
            bake(o, '["flow_off"]', [x + k * 0.37 for x in off])
    spray = []
    for i, t in enumerate(TIMES):
        p1 = K.psi(theta[i], 1)
        spray.append(TL.bump(p1, 352, 430) * st[i]['flow_vis'])
    bake(E.spray, '["flow_amt"]', spray)
    # estado de cena
    for k in ['xray_pos', 'xray_amt', 'xray_edge', 'cut_glow', 'car_wipe', 'front_hide']:
        sc[k] = 0.0
        bake(sc, f'["{k}"]', [s[k] for s in st])
    bake(cutter, 'location', [s['cut_y'] for s in st], 1)
    bake(hinge, 'rotation_euler', [math.radians(s['hood_angle']) for s in st], 0)
    for o in hood_parts:
        bake(o, '["hide"]', [s['hood_hide'] for s in st])
    for grp, key in (('car', 'car_light'), ('engine', 'engine_light')):
        for (o, e0) in lights[grp]:
            bake(o.data, 'energy', [e0 * s[key] for s in st])
    # ------------------------------------------------------------ otimizações de render
    # (1) carro oculto quando totalmente dissolvido; capô oculto quando invisível
    hide_car = [1.0 if s['car_wipe'] > 3.3 else 0.0 for s in st]
    for o in car_objs:
        if o.type == 'MESH':
            h = hide_car if o not in hood_parts else [max(a, 1.0 if s['hood_hide'] > 0.999 else 0.0) for a, s in zip(hide_car, st)]
            bake(o, 'hide_render', h, interp='CONSTANT')
    # (2) corte pré-aplicado durante o trecho estático; booleana ao vivo só nas varreduras
    sweep = [1.0 if (s['cut_y'] > -0.4599 and abs(s['cut_y'] - TL.Y_C1) > 1e-5) else 0.0 for s in st]
    hold = [1.0 if abs(s['cut_y'] - TL.Y_C1) <= 1e-5 else 0.0 for s in st]
    hold_frame = hold.index(1.0) + 40
    sc.frame_set(hold_frame)
    assert abs(cutter.location.y - TL.Y_C1) < 1e-6
    for o in list(E.static):
        if o.type != 'MESH':
            continue
        mods = {m.name: m.show_viewport for m in o.modifiers}
        for m in o.modifiers:
            m.show_viewport = True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        for m in o.modifiers:
            m.show_viewport = mods[m.name]
        dup = bpy.data.objects.new(o.name + '_cut', me)
        c_eng.objects.link(dup)
        dup.parent = o.parent
        dup.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        dup.matrix_basis = o.matrix_basis.copy()
        bake(dup, 'hide_render', [1.0 - h for h in hold], interp='CONSTANT')
        bake(o, 'hide_render', hold, interp='CONSTANT')
        o.keyframe_insert('modifiers["section"].show_render', frame=1)
        ad = o.animation_data
        cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
        fc = cb.fcurves.find('modifiers["section"].show_render')
        fc.keyframe_points.clear()
        fc.keyframe_points.add(N)
        co = []
        for i, v in enumerate(sweep):
            co += [i + 1, v]
        fc.keyframe_points.foreach_set('co', co)
        fc.keyframe_points.foreach_set('interpolation', [0] * N)
        fc.update()
    sc.frame_set(1)
    # ------------------------------------------------------------ câmera
    tr = TL.cam_tracks()
    rigo = bpy.data.objects.new('CamRig', None)
    tgt = bpy.data.objects.new('CamTarget', None)
    camd = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', camd)
    for o in (rigo, tgt, cam):
        c_std.objects.link(o)
    cam.parent = rigo
    tt = rigo.constraints.new('TRACK_TO')
    tt.target = tgt
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'
    sc.camera = cam
    camd.sensor_fit = 'AUTO'
    camd.sensor_width = 36
    camd.clip_start = 0.01
    camd.clip_end = 200
    camd.dof.use_dof = True
    camd.dof.focus_object = tgt
    cams = [TL.cam_at(t, tr) for t in TIMES]
    bake_vec(rigo, 'location', [c['pos'] for c in cams])
    bake_vec(tgt, 'location', [c['tgt'] for c in cams])
    bake(cam, 'rotation_euler', [math.radians(c['roll']) for c in cams], 2)
    bake(camd, 'lens', [c['lens'] for c in cams])
    bake(camd, 'dof.aperture_fstop', [c['fstop'] for c in cams])
    # ------------------------------------------------------------ render
    r = sc.render
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y = RES
    r.resolution_percentage = 100
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.45
    r.use_persistent_data = True
    r.film_transparent = False
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = SPP
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.05
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.max_bounces = 8
    cy.diffuse_bounces = 2
    cy.glossy_bounces = 3
    cy.transmission_bounces = 2
    cy.transparent_max_bounces = 14
    cy.volume_bounces = 0
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.sample_clamp_indirect = 6.0
    cy.blur_glossy = 1.0
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    sc.view_settings.exposure = 0.0
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'
    r.filepath = os.path.join(BUILD, 'frames', 'f_')
    # ------------------------------------------------------------ âncoras 2D para motion graphics
    print('exporting anchors...')
    anchors = {k: [] for k in E.anchor_objs}
    camdata = []
    for f in range(1, N + 1):
        sc.frame_set(f)
        for k, e in E.anchor_objs.items():
            p = e.matrix_world.translation
            v = world_to_camera_view(sc, cam, p)
            anchors[k].append([round(v.x, 4), round(1 - v.y, 4), round(v.z, 3)])
        camdata.append([round(x, 4) for x in cam.matrix_world.translation])
    data = dict(fps=K.FPS, frames=N, anchors=anchors,
                phases=[[K.phase_name(K.psi(th, c)) for c in range(1, 9)] for th in theta],
                psi1=[round(K.psi(th, 1), 2) for th in theta], theta=[round(th, 2) for th in theta],
                sparks=[[round(a, 4), b] for a, b in events])
    with open(os.path.join(BUILD, 'anim_data.json'), 'w') as fh:
        json.dump(data, fh)
    sc.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, 'v8_scene.blend'))
    print('DONE', time.time() - t0)


main()
