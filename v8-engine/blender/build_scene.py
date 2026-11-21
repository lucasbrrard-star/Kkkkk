"""Build the full V8 scene (engine + car + studio + FX) and save scene.blend.

blender -b --factory-startup -P build_scene.py -- [--noanim]
"""
import os
import sys
import math
import json
import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshkit as mk          # noqa: E402
import materials as mt        # noqa: E402
import build_engine as be     # noqa: E402
from v8kin import *           # noqa: E402,F401,F403

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
CACHE = os.path.join(HERE, '..', 'cache')
OUT = os.path.join(HERE, '..', 'render')
os.makedirs(OUT, exist_ok=True)
ENGINE_POS = Vector((0.0, -1.18, 0.45))


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, NF
    sc.render.fps = FPS
    sc.unit_settings.system = 'METRIC'
    return sc


def make_materials():
    M = {}
    al = mt.load_bk('cast_al')
    al2 = mt.load_bk('cast_al2')
    ss = mt.load_bk('brushed_ss')
    st = mt.load_bk('steel')
    an = mt.load_bk('black_anod')
    rb = mt.load_bk('rubber')
    ci = mt.load_bk('cast_iron')
    ch = mt.load_bk('satin_chrome')

    def cp(m, name):
        n = m.copy()
        n.name = name
        return n
    M['block'] = cp(al, 'Block')
    M['head'] = cp(al2, 'Head')
    M['pan'] = cp(al, 'Pan')
    M['throttle'] = cp(al, 'Throttle')
    M['cover2'] = cp(al2, 'TimingCover')
    mt.tint_bsdf(M['cover2'], color=(0.1, 0.105, 0.115))
    M['bore'] = cp(ci, 'BoreIron')
    M['section'] = mt.principled('Section', (0.26, 0.27, 0.29), metallic=1.0, rough=0.35)
    M['cover'] = cp(an, 'ValveCover')
    M['cover_in'] = mt.principled('CoverInside', (0.05, 0.05, 0.055), metallic=0.8, rough=0.5)
    M['coil'] = mt.principled('Coil', (0.015, 0.015, 0.017), rough=0.4, coat=0.3)
    M['intake'] = cp(an, 'Intake')
    M['intake_in'] = mt.principled('IntakeInside', (0.03, 0.03, 0.032), rough=0.65)
    M['rail'] = cp(ss, 'Rail')
    M['header'] = cp(ss, 'Header')
    M['header_in'] = mt.principled('HeaderInside', (0.06, 0.05, 0.045), metallic=0.6, rough=0.7)
    M['rubber'] = cp(rb, 'BeltRubber')
    M['letters'] = mt.principled('Letters', (0.85, 0.86, 0.88), metallic=1.0, rough=0.12)
    # moving parts (always solid)
    M['piston'] = cp(al2, 'Piston')
    M['crown'] = mt.principled('Crown', (0.16, 0.15, 0.14), metallic=0.7, rough=0.55)
    M['ring'] = mt.principled('Ring', (0.18, 0.18, 0.19), metallic=1.0, rough=0.3)
    M['pin'] = cp(ch, 'WristPin')
    M['rod'] = cp(st, 'Rod')
    M['bearing'] = mt.principled('Bearing', (0.72, 0.5, 0.32), metallic=1.0, rough=0.3)
    M['crank'] = cp(st, 'Crank')
    M['journal'] = cp(ch, 'Journal')
    M['sprocket'] = mt.principled('Sprocket', (0.13, 0.13, 0.14), metallic=1.0, rough=0.4)
    M['camshaft'] = cp(st, 'Camshaft')
    M['stem'] = cp(ch, 'ValveStem')
    M['valvehead'] = mt.principled('ValveHead', (0.3, 0.29, 0.28), metallic=1.0, rough=0.4)
    M['bucket'] = mt.principled('Bucket', (0.7, 0.71, 0.73), metallic=1.0, rough=0.18)
    M['spring'] = mt.principled('Spring', (0.08, 0.09, 0.1), metallic=1.0, rough=0.35)
    M['chain'] = mt.principled('Chain', (0.5, 0.5, 0.52), metallic=1.0, rough=0.3)
    # front-only moving parts (visibility controlled, never ghosted)
    M['crank_f'] = cp(st, 'CrankNose')
    M['journal_f'] = cp(ch, 'JournalNose')
    M['sprocket_f'] = cp(M['sprocket'], 'SprocketNose')
    # header heat tint (straw/blue near the ports)
    mt.tint_bsdf(M['header'], color=(0.62, 0.6, 0.58))
    mt.tint_bsdf(M['block'], color=(0.36, 0.37, 0.39))
    mt.tint_bsdf(M['head'], color=(0.44, 0.45, 0.47))
    mt.tint_bsdf(M['pan'], color=(0.2, 0.2, 0.22))
    mt.tint_bsdf(M['cover'], color=(0.025, 0.026, 0.03))
    mt.tint_bsdf(M['intake'], color=(0.03, 0.031, 0.035))
    mt.tint_bsdf(M['bore'], color=(0.36, 0.36, 0.37), metallic=1.0)
    for k in ('block', 'head', 'pan', 'throttle', 'cover2', 'bore', 'cover', 'coil', 'intake',
              'rail', 'header', 'rubber', 'letters'):
        mt.ghost_wrap(M[k], 'engine', origin_y=ENGINE_POS.y)
    for k in ('cover_in', 'intake_in', 'header_in'):
        mt.ghost_wrap(M[k], 'engine', origin_y=ENGINE_POS.y, inner=True)
    mt.ghost_wrap(M['section'], 'engine', origin_y=ENGINE_POS.y, cap=True)
    for k in ('crank_f', 'journal_f', 'sprocket_f', 'chain'):
        mt.ghost_wrap(M[k], 'engine', origin_y=ENGINE_POS.y, ghost=False)
    return M


def import_plug():
    path = os.path.join(CACHE, 'bk', '52ec4957.blend')
    with bpy.data.libraries.load(path) as (df, dt):
        dt.objects = list(df.objects)
    mt.USED_BK.add('52ec4957')
    col = bpy.data.collections.new('PLUG_SRC')
    root = bpy.data.objects.new('PlugRoot', None)
    col.objects.link(root)
    for o in dt.objects:
        if o is None:
            continue
        col.objects.link(o)
        if o.parent is None:
            o.parent = root
    root.scale = (0.26, 0.26, 0.26)
    return col


def import_pulley():
    path = os.path.join(CACHE, 'bk', 'fb654486.blend')
    with bpy.data.libraries.load(path) as (df, dt):
        dt.objects = list(df.objects)
    mt.USED_BK.add('fb654486')
    tmp = bpy.data.collections.new('PULLEY_TMP')
    bpy.context.scene.collection.children.link(tmp)
    meshes = []
    for o in dt.objects:
        tmp.objects.link(o)
        if o.type == 'MESH':
            meshes.append(o)
    bpy.context.view_layer.update()
    for o in meshes:
        o.matrix_basis = o.matrix_world.copy()
        o.parent = None
    src = mk.join(meshes, 'PulleySrc')
    for o in list(tmp.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    # recolour: dark machined steel instead of red
    for m in src.data.materials:
        if m and m.use_nodes:
            mt.tint_bsdf(m, color=(0.2, 0.2, 0.21), metallic=1.0)
            mt.ghost_wrap(m, 'engine', origin_y=ENGINE_POS.y)
    bpy.context.scene.collection.objects.unlink(src)
    return src


# ----------------------------------------------------------------------------
def gn_chain_group():
    ng = bpy.data.node_groups.new('ChainLinks', 'GeometryNodeTree')
    it = ng.interface
    it.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    it.new_socket('Offset', in_out='INPUT', socket_type='NodeSocketFloat')
    it.new_socket('Count', in_out='INPUT', socket_type='NodeSocketInt')
    it.new_socket('Link', in_out='INPUT', socket_type='NodeSocketObject')
    it.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    ln = N.new('GeometryNodeCurveLength')
    ng.links.new(gi.outputs['Geometry'], ln.inputs[0])
    pts = N.new('GeometryNodePoints')
    ng.links.new(gi.outputs['Count'], pts.inputs['Count'])
    idx = N.new('GeometryNodeInputIndex')
    div = N.new('ShaderNodeMath'); div.operation = 'DIVIDE'
    ng.links.new(ln.outputs[0], div.inputs[0]); ng.links.new(gi.outputs['Count'], div.inputs[1])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY_ADD'
    ng.links.new(idx.outputs[0], mul.inputs[0]); ng.links.new(div.outputs[0], mul.inputs[1]); ng.links.new(gi.outputs['Offset'], mul.inputs[2])
    mod = N.new('ShaderNodeMath'); mod.operation = 'FLOORED_MODULO'
    ng.links.new(mul.outputs[0], mod.inputs[0]); ng.links.new(ln.outputs[0], mod.inputs[1])
    sc = N.new('GeometryNodeSampleCurve'); sc.mode = 'LENGTH'
    ng.links.new(gi.outputs['Geometry'], sc.inputs['Curves'])
    ng.links.new(mod.outputs[0], sc.inputs['Length'])
    sp = N.new('GeometryNodeSetPosition')
    ng.links.new(pts.outputs[0], sp.inputs['Geometry'])
    ng.links.new(sc.outputs['Position'], sp.inputs['Position'])
    al = N.new('FunctionNodeAlignRotationToVector'); al.axis = 'X'
    ng.links.new(sc.outputs['Tangent'], al.inputs['Vector'])
    oi = N.new('GeometryNodeObjectInfo'); oi.transform_space = 'ORIGINAL'
    ng.links.new(gi.outputs['Link'], oi.inputs['Object'])
    iop = N.new('GeometryNodeInstanceOnPoints')
    ng.links.new(sp.outputs[0], iop.inputs['Points'])
    ng.links.new(oi.outputs['Geometry'], iop.inputs['Instance'])
    ng.links.new(al.outputs['Rotation'], iop.inputs['Rotation'])
    ng.links.new(iop.outputs[0], go.inputs[0])
    return ng


def gn_stream_group():
    ng = bpy.data.node_groups.new('FlowStream', 'GeometryNodeTree')
    it = ng.interface
    it.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    for nm, typ in (('Count', 'NodeSocketInt'), ('Phase', 'NodeSocketFloat'), ('Amount', 'NodeSocketFloat'),
                    ('Jitter', 'NodeSocketFloat'), ('Size', 'NodeSocketFloat'), ('Seed', 'NodeSocketInt'),
                    ('Cone', 'NodeSocketFloat'), ('Swirl', 'NodeSocketFloat'), ('Material', 'NodeSocketMaterial')):
        it.new_socket(nm, in_out='INPUT', socket_type=typ)
    it.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, Lk = ng.nodes, ng.links.new
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')

    def m(op, a, b=None, c=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, x in enumerate((a, b, c)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                Lk(x, n.inputs[i])
        return n.outputs[0]
    pts = N.new('GeometryNodePoints')
    Lk(gi.outputs['Count'], pts.inputs['Count'])
    idx = N.new('GeometryNodeInputIndex').outputs[0]
    r1 = N.new('FunctionNodeRandomValue'); r1.data_type = 'FLOAT'
    Lk(idx, r1.inputs['ID']); Lk(gi.outputs['Seed'], r1.inputs['Seed'])
    rv = r1.outputs[0]
    f = m('FRACT', m('ADD', m('ADD', m('DIVIDE', idx, gi.outputs['Count']), gi.outputs['Phase']), m('MULTIPLY', rv, 0.02)))
    sc = N.new('GeometryNodeSampleCurve'); sc.mode = 'FACTOR'
    Lk(gi.outputs['Geometry'], sc.inputs['Curves']); Lk(f, sc.inputs['Factor'])
    r2 = N.new('FunctionNodeRandomValue'); r2.data_type = 'FLOAT_VECTOR'
    r2.inputs['Min'].default_value = (-1, -1, -1); r2.inputs['Max'].default_value = (1, 1, 1)
    Lk(idx, r2.inputs['ID'])
    sd = m('ADD', gi.outputs['Seed'], 7)
    Lk(sd, r2.inputs['Seed'])
    # jitter scale: Jitter * mix(1, 2f, Cone)
    js = m('MULTIPLY', gi.outputs['Jitter'], m('ADD', m('MULTIPLY', m('SUBTRACT', 1.0, gi.outputs['Cone']), 1.0),
                                                   m('MULTIPLY', gi.outputs['Cone'], m('MULTIPLY', f, 2.0))))
    sv = N.new('ShaderNodeVectorMath'); sv.operation = 'SCALE'
    Lk(r2.outputs[0], sv.inputs[0]); Lk(js, sv.inputs['Scale'])
    rot = N.new('ShaderNodeVectorRotate'); rot.rotation_type = 'AXIS_ANGLE'
    Lk(sv.outputs[0], rot.inputs['Vector']); Lk(sc.outputs['Tangent'], rot.inputs['Axis'])
    Lk(m('MULTIPLY', f, gi.outputs['Swirl']), rot.inputs['Angle'])
    add = N.new('ShaderNodeVectorMath'); add.operation = 'ADD'
    Lk(sc.outputs['Position'], add.inputs[0]); Lk(rot.outputs[0], add.inputs[1])
    sp = N.new('GeometryNodeSetPosition')
    Lk(pts.outputs[0], sp.inputs['Geometry']); Lk(add.outputs[0], sp.inputs['Position'])
    mr1 = N.new('ShaderNodeMapRange'); mr1.interpolation_type = 'SMOOTHSTEP'
    Lk(f, mr1.inputs['Value']); mr1.inputs['From Min'].default_value = 0.0; mr1.inputs['From Max'].default_value = 0.1
    mr2 = N.new('ShaderNodeMapRange'); mr2.interpolation_type = 'SMOOTHSTEP'
    Lk(f, mr2.inputs['Value']); mr2.inputs['From Min'].default_value = 0.8; mr2.inputs['From Max'].default_value = 1.0
    mr2.inputs['To Min'].default_value = 1.0; mr2.inputs['To Max'].default_value = 0.0
    fade = m('MULTIPLY', m('MULTIPLY', mr1.outputs[0], mr2.outputs[0]), gi.outputs['Amount'], clamp=True)
    rad = m('MULTIPLY', m('MULTIPLY', gi.outputs['Size'], m('ADD', 0.45, rv)), m('SQRT', fade))
    spr = N.new('GeometryNodeSetPointRadius')
    Lk(sp.outputs[0], spr.inputs['Points']); Lk(rad, spr.inputs['Radius'])
    st1 = N.new('GeometryNodeStoreNamedAttribute'); st1.data_type = 'FLOAT'; st1.domain = 'POINT'
    st1.inputs['Name'].default_value = 'fade'
    Lk(spr.outputs[0], st1.inputs['Geometry']); Lk(fade, st1.inputs['Value'])
    st2 = N.new('GeometryNodeStoreNamedAttribute'); st2.data_type = 'FLOAT'; st2.domain = 'POINT'
    st2.inputs['Name'].default_value = 'heat'
    Lk(st1.outputs[0], st2.inputs['Geometry']); Lk(m('SUBTRACT', 1.0, f), st2.inputs['Value'])
    dl = N.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'
    Lk(st2.outputs[0], dl.inputs['Geometry']); Lk(m('LESS_THAN', fade, 0.03), dl.inputs['Selection'])
    smat = N.new('GeometryNodeSetMaterial')
    Lk(dl.outputs[0], smat.inputs['Geometry']); Lk(gi.outputs['Material'], smat.inputs['Material'])
    Lk(smat.outputs[0], go.inputs[0])
    return ng


def poly_curve(name, pts, cyclic=False, parent=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu)
    mk.link(ob)
    ob.parent = parent
    return ob


def set_gn(ob, ng, **vals):
    md = ob.modifiers.new('GN', 'NODES')
    md.node_group = ng
    for k, v in vals.items():
        ident = ng.interface.items_tree[k].identifier
        getattr(md.properties.inputs, ident).value = v
    return md


def gn_ident(ng, name):
    return ng.interface.items_tree[name].identifier


# ----------------------------------------------------------------------------
def build_chains(E, M, root):
    ng = gn_chain_group()
    # link mesh (one pitch): two side plates + roller
    bm = bmesh.new()
    p = be.CHAIN_PITCH
    for sy in (-1, 1):
        mk.add_box(bm, (p * 1.15, 0.0012, 0.0055), center=(0, sy * 0.0035, 0))
    mk.add_cyl(bm, 0.0022, 0.0058, seg=12, mat=Matrix.Translation((p / 2, -0.0029, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
    link = mk.new_obj('ChainLink', bm, [M['chain']], uv_scale=40)
    link.hide_render = True
    link.hide_viewport = True
    chains = {}
    for s in (1, -1):
        c0 = 1 if s > 0 else 2
        cc = cam_centre(c0, 'in')
        pts2 = mk.circle_pts(0, 0, be.R_CRANK_SPR, 96) + mk.circle_pts(cc[0], cc[2], be.R_CAM_SPR, 160)
        hull = mk.hull2d(pts2)
        # resample hull densely
        y = be.CHAIN_Y[s]
        pts3 = [(h[0], y, h[1]) for h in hull]
        cur = poly_curve(f'ChainPath_{s:+d}', pts3, cyclic=True, parent=root)
        length = sum((Vector(pts3[i]) - Vector(pts3[i - 1])).length for i in range(len(pts3)))
        n = int(round(length / p))
        set_gn(cur, ng, Offset=0.0, Count=n, Link=link)
        cur['isfront'] = 1.0
        chains[s] = (cur, length)
    return chains, ng


def build_streams(E, M, root):
    ng = gn_stream_group()
    c = 1
    a_in = Vector(valve_axis(c, 'in'))
    a_ex = Vector(valve_axis(c, 'ex'))
    seat_in = Vector(valve_seat(c, 'in'))
    seat_ex = Vector(valve_seat(c, 'ex'))
    U = Vector(bank_U(c))
    ax0 = Vector((0, cyl_y(c), 0))
    # intake: plenum -> runner -> port -> seat -> into bore
    run = list(reversed(E.runner_paths[c]))
    port = list(reversed(E.port_paths[(c, 'in')]))
    inside = []
    for k in range(1, 9):
        t = k / 8
        cpt = ax0 + U * (DECK - 0.004 - 0.035 * t)
        inside.append(seat_in.lerp(cpt, min(1.0, t * 1.4)) - a_in * 0.0 + Vector((0, 0.012 * math.sin(t * 3.0), 0)))
    path_in = run + port[1:] + [seat_in - a_in * 0.006] + inside
    # exhaust: bore -> seat -> port -> header
    start = [ax0 + U * (DECK - 0.03) + (seat_ex - ax0 - U * DECK) * 0.3, ax0 + U * (DECK - 0.012) + (seat_ex - ax0 - U * DECK) * 0.7, seat_ex - a_ex * 0.006]
    path_ex = start + E.port_paths[(c, 'ex')][1:] + E.header_paths[c][1:]
    tip, d = E.injectors[c]
    path_fuel = [tip, tip.lerp(seat_in, 0.5), seat_in - a_in * 0.004]
    mats = {
        'air': mt.particle_material('AirParticle', (0.5, 0.75, 1.0), (0.35, 0.65, 1.0), 2.5, alpha=0.85),
        'fuel': mt.particle_material('FuelParticle', (1.0, 0.82, 0.35), (1.0, 0.75, 0.3), 4.0, alpha=1.0),
        'exh': mt.particle_material('ExhaustParticle', (0.32, 0.3, 0.29), (1.0, 0.42, 0.1), 6.0, alpha=0.75, use_heat=True),
    }
    streams = {}
    for name, path, kw in (
            ('air', path_in, dict(Count=220, Jitter=0.0085, Size=0.0016, Seed=3, Cone=0.0, Swirl=9.0)),
            ('fuel', path_fuel, dict(Count=70, Jitter=0.004, Size=0.0009, Seed=11, Cone=1.0, Swirl=4.0)),
            ('exh', path_ex, dict(Count=240, Jitter=0.008, Size=0.0024, Seed=5, Cone=0.0, Swirl=6.0))):
        cur = poly_curve(f'Stream_{name}', path, parent=root)
        set_gn(cur, ng, Phase=0.0, Amount=0.0, Material=mats[name], **kw)
        streams[name] = cur
    return streams, ng


def build_sparks(E, M, root):
    sparks = {}
    m = bpy.data.materials.new('SparkArc')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.7, 0.82, 1.0, 1)
    att = nt.nodes.new('ShaderNodeAttribute'); att.attribute_type = 'OBJECT'; att.attribute_name = 'spark'
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 300.0
    nt.links.new(att.outputs['Fac'], mul.inputs[0]); nt.links.new(mul.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.01
    nt.links.new(att.outputs['Fac'], gt.inputs[0])
    nt.links.new(gt.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    for c in CYLS:
        U = Vector(bank_U(c))
        tip = E.parts['plug_tips'][c]
        W = Vector(bank_W(c))
        pts = []
        for k in range(7):
            t = k / 6
            off = W * (0.00035 * (1 if k % 2 else -1) * math.sin(math.pi * t)) + Vector((0, 0.0003 * math.sin(7 * t), 0))
            pts.append(tip - U * (0.0003 + 0.0016 * t) + off)
        bm = bmesh.new()
        mk.sweep_tube(bm, pts, 0.00022, seg=6)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.0011, matrix=Matrix.Translation(tip - U * 0.0011))
        o = mk.new_obj(f'Spark_{c}', bm, [m], parent=root, uv_scale=None)
        o['spark'] = 0.0
        o.visible_shadow = False
        sparks[c] = o
    return sparks


def build_car():
    path = os.path.join(CACHE, 'bk', 'fdb71593.blend')
    with bpy.data.libraries.load(path) as (df, dt):
        dt.objects = list(df.objects)
    mt.USED_BK.add('fdb71593')
    col = bpy.data.collections.new('CAR')
    bpy.context.scene.collection.children.link(col)
    for o in dt.objects:
        if o is not None:
            col.objects.link(o)
    # neutral, logo-free look: hide badges
    for nm in ('Plane.016', 'Plane.020', 'Plane.028'):
        if nm in bpy.data.objects:
            bpy.data.objects[nm].hide_render = True
    mats = set()
    for o in col.objects:
        if o.type == 'MESH':
            for s in o.material_slots:
                if s.material:
                    mats.add(s.material)
            for md in o.modifiers:
                if md.type == 'SUBSURF':
                    md.render_levels = min(md.render_levels, 2)
    for m in mats:
        if not m.use_nodes:
            continue
        if m.name.startswith(('Car paint', 'Paint_new', 'Blue Paint')):
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    inp = n.inputs['Base Color']
                    for l in list(inp.links):
                        m.node_tree.links.remove(l)
                    inp.default_value = (0.026, 0.029, 0.034, 1)
                    for l in list(n.inputs['Metallic'].links):
                        m.node_tree.links.remove(l)
                    n.inputs['Metallic'].default_value = 0.7
                    for l in list(n.inputs['Roughness'].links):
                        m.node_tree.links.remove(l)
                    n.inputs['Roughness'].default_value = 0.3
                    n.inputs['Coat Weight'].default_value = 1.0
                    n.inputs['Coat Roughness'].default_value = 0.03
        mt.ghost_wrap(m, 'car', ghost_col=(0.3, 0.56, 1.0), rim_k=0.38, alpha_k=0.14, gloss=(0.015, 0.02, 0.03))
    return col


def build_studio():
    sc = bpy.context.scene
    # floor
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    fl = mk.new_obj('Floor', bm, None, uv_scale=None)
    m = bpy.data.materials.new('Floor')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.012, 0.014, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.25, 0.25, 0.25)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(CACHE, 'ph', 'concrete_floor_painted_Rough.jpg'))
    img.image.colorspace_settings.name = 'Non-Color'
    nt.links.new(mp.outputs[0], img.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 0.08; mr.inputs['To Max'].default_value = 0.38
    nt.links.new(img.outputs['Color'], mr.inputs['Value'])
    nt.links.new(mr.outputs[0], b.inputs['Roughness'])
    fl.data.materials.append(m)
    # world: HDRI for reflections only, dark for camera
    w = bpy.data.worlds.new('Studio')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(CACHE, 'ph', 'studio_small_09_2k.hdr'))
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.radians(110))
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs[0], env.inputs['Vector'])
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.35
    lp = nt.nodes.new('ShaderNodeLightPath')
    dark = nt.nodes.new('ShaderNodeBackground'); dark.inputs['Color'].default_value = (0.0025, 0.003, 0.004, 1)
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0])
    nt.links.new(bg.outputs[0], mx.inputs[1]); nt.links.new(dark.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], nt.nodes['World Output'].inputs['Surface'])

    def area(name, loc, rot, size, size_y, energy, color=(1, 1, 1), shape='RECTANGLE'):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.shape = shape
        ld.size = size
        ld.size_y = size_y
        ld.energy = energy
        ld.color = color
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = [math.radians(a) for a in rot]
        mk.link(o)
        return o
    L = {}
    L['top'] = area('TopSoftbox', (0, -0.4, 3.8), (0, 0, 0), 2.4, 5.5, 650, (1.0, 0.98, 0.95))
    L['stripL'] = area('StripL', (-2.7, -0.3, 1.4), (0, -90, 0), 0.35, 5.2, 420, (0.62, 0.78, 1.0))
    L['stripR'] = area('StripR', (2.7, -0.3, 1.4), (0, 90, 0), 0.35, 5.2, 300, (0.62, 0.78, 1.0))
    L['rim'] = area('Rim', (0, 4.2, 1.7), (-90, 0, 0), 3.2, 1.0, 320, (0.75, 0.85, 1.0))
    L['kick'] = area('FrontKick', (0.6, -4.6, 0.5), (90, 0, 0), 2.5, 0.6, 60, (1.0, 0.92, 0.85))
    return L


def engine_lights(root):
    def area(name, off, size, energy, color, target):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.size = size
        ld.energy = energy
        ld.color = color
        o = bpy.data.objects.new(name, ld)
        o.location = ENGINE_POS + Vector(off)
        mk.link(o)
        c = o.constraints.new('TRACK_TO')
        c.target = target
        c.track_axis = 'TRACK_NEGATIVE_Z'
        c.up_axis = 'UP_Y'
        return o
    tgt = bpy.data.objects.new('EngLightTarget', None)
    tgt.location = ENGINE_POS + Vector((0, 0, 0.18))
    mk.link(tgt)
    L = {}
    L['ekey'] = area('EngKey', (-0.55, -0.75, 0.55), 0.45, 18, (1.0, 0.97, 0.92), tgt)
    L['efill'] = area('EngFill', (0.7, -0.45, 0.1), 0.35, 8, (0.55, 0.72, 1.0), tgt)
    L['etop'] = area('EngTop', (0.0, 0.05, 0.85), 0.6, 12, (1.0, 0.98, 0.95), tgt)
    L['erim'] = area('EngRim', (0.15, 0.75, 0.45), 0.4, 14, (0.6, 0.75, 1.0), tgt)
    # section close-up key (cyl 1)
    t1 = bpy.data.objects.new('Cyl1Target', None)
    t1.location = ENGINE_POS + Vector(bank_point(1, DECK - 0.06, 0.0))
    mk.link(t1)
    L['skey'] = area('SectKey', (0.05 + 0.2, -0.5, 0.45), 0.3, 6, (1.0, 0.97, 0.93), t1)
    L['sfill'] = area('SectFill', (0.45, -0.35, 0.0), 0.25, 3, (0.55, 0.72, 1.0), t1)
    # combustion light inside cylinder 1 + spark flash lights
    ld = bpy.data.lights.new('FlameLight', 'POINT')
    ld.color = (1.0, 0.5, 0.15)
    ld.energy = 0.0
    ld.shadow_soft_size = 0.01
    fl = bpy.data.objects.new('FlameLight', ld)
    U = Vector(bank_U(1))
    fl.location = ENGINE_POS + Vector(bank_point(1, DECK - 0.012, 0.0)) + Vector((0, 0.01, 0))
    mk.link(fl)
    L['flame'] = fl
    return L


def link_engine_lights(root, elights):
    col = bpy.data.collections.new('ENGINE_RECV')
    for o in bpy.data.objects:
        p = o
        while p.parent is not None:
            p = p.parent
        if p == root and o.type in ('MESH', 'CURVE', 'EMPTY', 'FONT'):
            col.objects.link(o)
    for k, o in elights.items():
        o.light_linking.receiver_collection = col


def main():
    sc = reset()
    M = make_materials()
    gas_mat = mt.gas_material()
    root = bpy.data.objects.new('ENGINE', None)
    root.location = ENGINE_POS
    mk.link(root)
    M['_pulley_src'] = import_pulley()
    plug_col = import_plug()
    E = be.Engine(M, root)
    E.block()
    E.heads()
    E.intake()
    E.exhaust()
    E.front()
    E.pistons()
    E.rods()
    E.crank()
    E.cams()
    E.valves()
    E.spark_plugs(plug_col)
    E.gas(gas_mat)
    E.split_static()
    chains, chain_ng = build_chains(E, M, root)
    streams, stream_ng = build_streams(E, M, root)
    sparks = build_sparks(E, M, root)
    car = build_car()
    studio = build_studio()
    elights = engine_lights(root)
    link_engine_lights(root, elights)
    scene_data = dict(E=E, chains=chains, chain_ng=chain_ng, streams=streams, stream_ng=stream_ng,
                      sparks=sparks, studio=studio, elights=elights, root=root)
    import anim
    anim.animate(sc, scene_data, test='--noanim' in ARGS)
    import render_settings
    render_settings.apply(sc)
    for m in bpy.data.materials:
        m.cycles.emission_sampling = 'NONE'
    json.dump(sorted(mt.USED_BK), open(os.path.join(OUT, 'used_blenderkit.json'), 'w'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'scene.blend'), compress=True)
    print('SAVED scene.blend')


if __name__ == '__main__':
    main()
