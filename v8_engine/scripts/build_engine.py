"""Constrói o V8 procedural no Blender (geometria + materiais). Importado por build_scene.py."""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
import kin as K  # noqa: E402
import geo as G  # noqa: E402
import mats as MT  # noqa: E402

D2R = math.pi / 180
SIN20, COS20 = math.sin(K.VALVE_TILT * D2R), math.cos(K.VALVE_TILT * D2R)
MIRX = Matrix.Scale(-1, 4, Vector((1, 0, 0)))


def RY(deg):
    return Matrix.Rotation(deg * D2R, 4, 'Y')


def T(v):
    return Matrix.Translation(Vector(v))


def bankM(b):
    return RY(-45) if b == 'R' else RY(45) @ MIRX


def bank_pt(b, xb, y, zb):
    return bankM(b) @ Vector((xb, y, zb))


def bank_dir(b, v):
    return (bankM(b).to_3x3() @ Vector(v)).normalized()


def ang_of(v):
    """ângulo da convenção (de +Z para +X)"""
    return math.degrees(math.atan2(v.x, v.z))


def cyls(b):
    return [1, 2, 3, 4] if b == 'R' else [5, 6, 7, 8]


def cyl_y_mesh(r, y0, y1, cx=0.0, cz=0.0, seg=48, name='cy'):
    me = G.cylinder(r, y0, y1, seg, name)
    me.transform(T((cx, 0, cz)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
    return me


def axis_cyl(r, d0, d1, origin, ang_deg, seg=32, name='ac', y=0.0):
    """cilindro ao longo de uma direção no plano XZ (ângulo da convenção), a partir de origin"""
    me = G.cylinder(r, d0, d1, seg, name)
    me.transform(T(origin) @ RY(ang_deg))
    return me


def toothed_disc(r_root, r_tip, teeth, y0, y1, name='sprocket', hub_r=None):
    pts = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4)
        r = r_tip if (i % 4) in (1, 2) else r_root
        pts.append((r * math.sin(a), r * math.cos(a)))
    me = G.prism_xz(pts, y0, y1, name)
    return me


class Engine:
    def __init__(self, root, col):
        self.root = root
        self.col = col
        self.o = {}
        self.static = []      # peças cortadas no corte técnico
        self.M = {}

    # ------------------------------------------------------------------ materiais
    def materials(self):
        M = self.M
        M['alu'] = MT.bk_material('d44d4d73', 'M_cast_aluminum')
        M['iron'] = MT.bk_material('f494715c', 'M_cast_iron')
        M['crank'] = MT.bk_material('b385c9fc', 'M_machined_steel')
        M['rod'] = MT.bk_material('d49a5c9f', 'M_brushed_steel')
        M['valve'] = MT.bk_material('4f016d1a', 'M_valve_steel')
        M['chrome'] = MT.bk_material('589e86f2', 'M_chrome')
        M['plastic'] = MT.bk_material('335d2f7f', 'M_black_composite')
        M['header'] = MT.bk_material('7891ca49', 'M_header_ti')
        MT.tint(M['alu'], (0.58, 0.58, 0.6))
        MT.rescale_coords(M['crank'].node_tree, 7.0)
        MT.rescale_coords(M['valve'].node_tree, 8.0)
        MT.rescale_coords(M['header'].node_tree, 3.0)
        M['crank_front'] = M['crank'].copy()
        M['crank_front'].name = 'M_machined_steel_front'
        M['cover'] = MT.add_noise_rough(MT.principled('M_cover_wrinkle', (0.018, 0.018, 0.02), 0.0, 0.5), 40, 0.12, bump=0.35, bump_scale=900)
        M['piston'] = MT.add_noise_rough(MT.principled('M_piston', (0.80, 0.80, 0.82), 1.0, 0.3), 80, 0.08)
        M['skirt'] = MT.add_noise_rough(MT.principled('M_piston_coat', (0.06, 0.06, 0.065), 0.2, 0.55), 200, 0.1)
        M['ring'] = MT.principled('M_ring', (0.22, 0.22, 0.24), 1.0, 0.28)
        M['gasket'] = MT.principled('M_gasket', (0.16, 0.16, 0.17), 0.9, 0.42)
        M['spring'] = MT.principled('M_spring', (0.30, 0.33, 0.38), 1.0, 0.32)
        M['cut'] = MT.add_noise_rough(MT.principled('M_cutface', (0.42, 0.43, 0.45), 0.75, 0.42, aniso=0.3), 150, 0.06)
        M['belt'] = MT.belt_material()
        M['bolt'] = MT.principled('M_bolt', (0.12, 0.12, 0.13), 1.0, 0.35)
        M['gas'] = MT.gas_material()
        M['flow_in'] = MT.flow_material('M_flow_in', (0.3, 0.68, 1.0), 9.0)
        M['flow_ex'] = MT.flow_material('M_flow_ex', (1.0, 0.42, 0.12), 6.0)
        M['spark'] = MT.emissive('M_spark', (0.65, 0.82, 1.0), 'spark', 120.0)
        M['spray'] = MT.emissive('M_spray', (0.55, 0.85, 1.0), 'flow_amt', 3.0)
        # brilho na face de corte durante a revelação
        nt = M['cut'].node_tree
        p = nt.nodes.get('Principled BSDF')
        a = MT.attr(nt, 'cut_glow', 'VIEW_LAYER', (-600, -600))
        p.inputs['Emission Color'].default_value = (0.5, 0.75, 1.0, 1)
        nt.links.new(MT.math_node(nt, 'MULTIPLY', a.outputs['Fac'], 4.0, (-400, -600)), p.inputs['Emission Strength'])
        for k in ['alu', 'iron', 'plastic', 'header', 'cover', 'gasket', 'cut']:
            MT.wrap_xray(M[k])
        MT.wrap_hide(M['crank_front'], 'front_hide')
        MT.wrap_hide(M['belt'], 'front_hide')
        return M

    def add(self, name, me, mat, parent=None, static=False, uv=6.0, bevel=None, smooth=None):
        if uv:
            G.box_uv(me, uv)
        if smooth:
            G.smooth_mesh(me, smooth)
        o = G.new_obj(name, me, self.col, parent or self.root)
        if isinstance(mat, (list, tuple)):
            for m in mat:
                o.data.materials.append(m)
        elif mat:
            o.data.materials.append(mat)
        if bevel:
            G.add_bevel(o, bevel)
        if static:
            self.static.append(o)
        self.o[name] = o
        return o

    # ------------------------------------------------------------------ bloco
    def block(self):
        cc = G.prism_xz(G.rounded_rect(0, 0.0125, 0.33, 0.175, 0.02), -0.222, 0.222, 'Block')
        ob = G.new_obj('Block', cc, self.col, self.root)
        for b in 'RL':
            tw = G.box((-0.066, -0.222, 0.04), (0.066, 0.222, K.DECK), 'tw')
            G.transform_mesh(tw, bankM(b))
            G.apply_bool(ob, tw, 'UNION')
        G.apply_bool(ob, G.box((-0.11, -0.222, 0.05), (0.11, 0.222, 0.16)), 'UNION')
        for b in 'RL':
            ys = [K.cyl_info(c)[2] for c in cyls(b)]
            outer = G.box((-0.060, ys[0] - 0.058, 0.12), (0.060, ys[-1] + 0.058, K.DECK - 0.006))
            G.transform_mesh(outer, bankM(b))
            G.apply_bool(ob, outer)
            inner = G.box((-0.0525, ys[0] - 0.0505, 0.10), (0.0525, ys[-1] + 0.0505, K.DECK))
            G.transform_mesh(inner, bankM(b))
            G.apply_bool(ob, inner, 'UNION')
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            bore = G.cylinder(K.RB + 0.0025, 0.03, K.DECK + 0.01, 64)
            G.transform_mesh(bore, bankM(b) @ T((0, y, 0)))
            G.apply_bool(ob, bore)
        for j in range(4):
            G.apply_bool(ob, cyl_y_mesh(0.098, K.pin_y(j) - 0.041, K.pin_y(j) + 0.041, seg=64))
        G.apply_bool(ob, cyl_y_mesh(0.0345, -0.4, 0.4, seg=48))
        me = ob.data
        G.box_uv(me, 6)
        G.smooth_mesh(me, 30)
        me.materials.append(self.M['alu'])
        G.add_bevel(ob, 0.0012, 1, 50)
        self.o['Block'] = ob
        self.static.append(ob)
        # camisas (ferro fundido)
        mes = []
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            r = G.tube_ring(K.RB, K.RB + 0.0025, 0.095, K.DECK, 64)
            G.transform_mesh(r, bankM(b) @ T((0, y, 0)))
            mes.append(r)
        self.add('Liners', G.join_meshes(mes, 'Liners'), self.M['iron'], static=True, smooth=40)
        # junta do cabeçote
        for b in 'RL':
            g = G.box((-0.1, -0.222, K.DECK), (0.1, 0.222, K.DECK + 0.0012), 'gasket')
            og = G.new_obj('Gasket_' + b, g, self.col, self.root)
            for c in cyls(b):
                y = K.cyl_info(c)[2]
                G.apply_bool(og, _tr(G.cylinder(K.RB + 0.001, K.DECK - 0.01, K.DECK + 0.01, 48), T((0, y, 0))))
            G.transform_mesh(og.data, bankM(b))
            G.box_uv(og.data)
            og.data.materials.append(self.M['gasket'])
            self.static.append(og)
        # cárter
        outer = [(-0.155, -0.075), (0.155, -0.075), (0.148, -0.12), (0.13, -0.205), (-0.13, -0.205), (-0.148, -0.12)]
        inner = [(-0.149, -0.07), (0.149, -0.07), (0.142, -0.12), (0.125, -0.199), (-0.125, -0.199), (-0.142, -0.12)]
        op = G.new_obj('OilPan', G.prism_xz(outer, -0.215, 0.215, 'OilPan'), self.col, self.root)
        G.apply_bool(op, G.prism_xz(inner, -0.209, 0.209))
        G.box_uv(op.data)
        G.smooth_mesh(op.data, 30)
        op.data.materials.append(self.M['alu'])
        G.add_bevel(op, 0.004, 2, 40)
        self.static.append(op)
        self.o['OilPan'] = op

    # ------------------------------------------------------------------ cabeçotes
    def chamber_cutter(self, y, inset=0.0, z_bottom=None):
        bm = bmesh.new()
        r = K.RB - inset
        zb = K.DECK - 0.002 if z_bottom is None else z_bottom
        bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=r, radius2=r, depth=0.03)
        for v in bm.verts:
            v.co.y += y
            v.co.z += zb + 0.015
        for sgn in (1, -1):
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-7, plane_co=(0, y, K.DECK + K.ROOF_H0 - inset),
                                   plane_no=(sgn * SIN20, 0, COS20), clear_outer=True)
            bnd = [e for e in bm.edges if e.is_boundary]
            if bnd:
                bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return G.bm_to_mesh(bm, 'chamber')

    def valve_seat(self, kind, y_sign, y):
        x = K.VALVE_X if kind == 'I' else -K.VALVE_X
        z = K.DECK + K.ROOF_H0 - math.tan(K.VALVE_TILT * D2R) * K.VALVE_X
        d = Vector((SIN20 if kind == 'I' else -SIN20, 0, COS20))
        return Vector((x, y + y_sign * K.VALVE_Y, z)), d

    def heads(self):
        M = self.M
        self.cam_centers = {}
        for b in 'RL':
            hb = G.box((-0.10, -0.222, K.DECK + 0.0012), (0.10, 0.222, K.DECK + 0.13), 'Head_' + b)
            oh = G.new_obj('Head_' + b, hb, self.col, self.root)
            for c in cyls(b):
                y = K.cyl_info(c)[2]
                G.apply_bool(oh, self.chamber_cutter(y))
                # dutos de admissão (+X local) e escape (-X local)
                for kind, sx, zf, rm, rbr in (('I', 1, 0.055, 0.016, 0.0135), ('E', -1, 0.040, 0.0145, 0.0122)):
                    F = Vector((sx * 0.108, y, K.DECK + zf))
                    Mid = Vector((sx * 0.036, y, K.DECK + 0.03))
                    main = G.sweep(G.catmull([F, Vector((sx * 0.07, y, K.DECK + zf - 0.006)), Mid], 10), rm, 32)
                    G.apply_bool(oh, main)
                    for ys in (-1, 1):
                        S, d = self.valve_seat(kind, ys, y)
                        p_end = S - d * 0.004
                        p_thr = S + d * 0.010
                        br = G.sweep(G.catmull([Mid, Mid.lerp(p_thr, 0.55) + Vector((0, 0, 0.004)), p_thr, p_end], 10), rbr, 28)
                        G.apply_bool(oh, br)
                        # guia e alojamento do tucho
                        a = math.degrees(math.atan2(d.x, d.z))
                        G.apply_bool(oh, axis_cyl(0.0034, 0.004, 0.075, S, a, 16))
                        G.apply_bool(oh, axis_cyl(0.0158, 0.058, 0.15, S, a, 40))
                # poço da vela
                G.apply_bool(oh, _tr(G.cylinder(0.0075, K.DECK + 0.004, K.DECK + 0.045, 24), T((0, y, 0))))
                G.apply_bool(oh, _tr(G.cylinder(0.0128, K.DECK + 0.04, K.DECK + 0.2, 32), T((0, y, 0))))
                # canal dos comandos (entre mancais)
                G.apply_bool(oh, G.box((-0.093, y - 0.042, K.DECK + 0.096), (0.093, y + 0.042, K.DECK + 0.2)))
            ys = [K.cyl_info(c)[2] for c in cyls(b)]
            cxI = K.VALVE_X + K.CAM_DIST * SIN20
            czI = K.DECK + K.ROOF_H0 - math.tan(K.VALVE_TILT * D2R) * K.VALVE_X + K.CAM_DIST * COS20
            for sx in (1, -1):
                G.apply_bool(oh, cyl_y_mesh(0.0136, -0.3, 0.3, sx * cxI, czI, 40))
            G.box_uv(oh.data, 6)
            G.smooth_mesh(oh.data, 30)
            G.transform_mesh(oh.data, bankM(b))
            oh.data.materials.append(M['alu'])
            G.add_bevel(oh, 0.0012, 1, 50)
            self.static.append(oh)
            self.o['Head_' + b] = oh
            self.cam_centers[(b, 'I')] = bank_pt(b, cxI, 0, czI)
            self.cam_centers[(b, 'E')] = bank_pt(b, -cxI, 0, czI)
            # capas dos mancais
            mes = []
            ribs = [ys[0] - 0.05] + [(ys[i] + ys[i + 1]) / 2 for i in range(3)] + [ys[-1] + 0.05]
            for ry in ribs:
                for sx in (1, -1):
                    mes.append(G.box((sx * cxI - 0.017, ry - 0.0075, czI), (sx * cxI + 0.017, ry + 0.0075, czI + 0.021)))
            caps = G.new_obj('CamCaps_' + b, G.join_meshes(mes, 'CamCaps_' + b), self.col, self.root)
            for sx in (1, -1):
                G.apply_bool(caps, cyl_y_mesh(0.0136, -0.3, 0.3, sx * cxI, czI, 40))
            G.box_uv(caps.data)
            G.transform_mesh(caps.data, bankM(b))
            caps.data.materials.append(M['alu'])
            G.add_bevel(caps, 0.001, 1, 50)
            self.static.append(caps)
            # tampa de válvulas
            zc0 = K.DECK + 0.13
            prof_o = [(-0.104, zc0), (0.104, zc0)] + [(x, z) for (x, z) in G.circle_pts(0.079, zc0 + 0.037, 0.025, 8, 0, 90)] + \
                [(x, z) for (x, z) in G.circle_pts(-0.079, zc0 + 0.037, 0.025, 8, 90, 180)]
            prof_i = [(-0.1, zc0 - 0.01), (0.1, zc0 - 0.01)] + [(x, z) for (x, z) in G.circle_pts(0.079, zc0 + 0.037, 0.021, 8, 0, 90)] + \
                [(x, z) for (x, z) in G.circle_pts(-0.079, zc0 + 0.037, 0.021, 8, 90, 180)]
            cv = G.new_obj('Cover_' + b, G.prism_xz(prof_o, -0.226, 0.226), self.col, self.root)
            G.apply_bool(cv, G.prism_xz(prof_i, -0.222, 0.222))
            for c in cyls(b):
                y = K.cyl_info(c)[2]
                G.apply_bool(cv, _tr(G.cylinder(0.0132, zc0 - 0.02, zc0 + 0.1, 32), T((0, y, 0))))
            G.box_uv(cv.data)
            G.smooth_mesh(cv.data, 35)
            G.transform_mesh(cv.data, bankM(b))
            cv.data.materials.append(M['cover'])
            G.add_bevel(cv, 0.0015, 2, 50)
            self.static.append(cv)
            self.o['Cover_' + b] = cv

    # ------------------------------------------------------------------ bobinas e velas
    def ignition(self):
        mes = []
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            body = _tr(G.cylinder(0.0105, K.DECK + 0.098, K.DECK + 0.205, 24), T((0, y, 0)))
            top = G.box((-0.017, y - 0.024, K.DECK + 0.193), (0.017, y + 0.024, K.DECK + 0.22))
            con = G.box((-0.008, y + 0.018, K.DECK + 0.2), (0.008, y + 0.036, K.DECK + 0.214))
            for me in (body, top, con):
                G.transform_mesh(me, bankM(b))
                mes.append(me)
        self.add('Coils', G.join_meshes(mes, 'Coils'), self.M['plastic'], static=True, smooth=35, bevel=0.0012)
        # velas BlenderKit (instâncias de coleção)
        path = os.path.join(MT.BK, 'blend', '52ec4957.blend')
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
        pc = bpy.data.collections.new('PLUG_SRC')
        bpy.context.scene.collection.children.link(pc)
        for o in dst.objects:
            if o:
                pc.objects.link(o)
        bpy.context.view_layer.layer_collection.children['PLUG_SRC'].exclude = True
        # materiais da vela: casca metálica e isolador cerâmico
        for o in dst.objects:
            if o and o.type == 'MESH':
                for slot in o.material_slots:
                    if slot.material and 'aluminium' in slot.material.name.lower():
                        p = slot.material.node_tree.nodes.get('Principled BSDF')
                        if p:
                            p.inputs['Metallic'].default_value = 1.0
                            p.inputs['Roughness'].default_value = 0.3
                            p.inputs['Base Color'].default_value = (0.72, 0.72, 0.74, 1)
        self.plug_tips = {}
        sc = 0.27
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            tip = bank_pt(b, 0, y, K.DECK + K.ROOF_H0 - 0.0025)
            e = bpy.data.objects.new(f'SparkPlug_{c}', None)
            e.instance_type = 'COLLECTION'
            e.instance_collection = pc
            self.col.objects.link(e)
            e.parent = self.root
            e.location = tip
            e.rotation_euler = (0, K.BANK_ANG[b] * D2R, 0)
            e.scale = (sc, sc, sc)
            self.plug_tips[c] = tip.copy()
            self.o[f'SparkPlug_{c}'] = e

    # ------------------------------------------------------------------ virabrequim
    def crankshaft(self):
        mes = []
        for k in range(5):
            y = -0.2 + 0.1 * k
            mes.append(cyl_y_mesh(0.0338, y - 0.0106, y + 0.0106, seg=48))
        for j in range(4):
            a = K.PIN_OFF[j] * D2R
            cx, cz = K.CR * math.sin(a), K.CR * math.cos(a)
            py = K.pin_y(j)
            mes.append(cyl_y_mesh(0.0265, py - 0.0236, py + 0.0236, cx, cz, 40))
            for side in (-1, 1):
                y0 = py + side * 0.0235
                y1 = y0 + side * 0.016
                pts = G.circle_pts(0, 0, 0.041, 36) + G.circle_pts(cx, cz, 0.034, 36)
                cwc = (K.PIN_OFF[j] + 180)
                for i in range(25):
                    ang = (cwc - 62 + 124 * i / 24) * D2R
                    pts.append((0.079 * math.sin(ang), 0.079 * math.cos(ang)))
                hull = G.convex_hull(pts)
                mes.append(G.prism_xz(hull, min(y0, y1), max(y0, y1)))
        front = [cyl_y_mesh(0.024, -0.33, -0.2105, seg=40)]
        mes.append(cyl_y_mesh(0.045, 0.21, 0.228, seg=48))
        for yb in (-0.245, -0.268):
            front.append(toothed_disc(0.0285, 0.0318, 21, yb - 0.0095, yb + 0.0095))
        mes.append(cyl_y_mesh(0.14, 0.228, 0.232, seg=96))
        mes.append(toothed_disc(0.142, 0.149, 120, 0.2265, 0.2355))
        me = G.join_meshes(mes, 'Crankshaft')
        o = self.add('Crankshaft', me, self.M['crank'], smooth=32, bevel=0.0012)
        fo = self.add('CrankFront', G.join_meshes(front, 'CrankFront'), self.M['crank_front'], parent=o, smooth=32)
        # polia/amortecedor dianteiro (BlenderKit)
        path = os.path.join(MT.BK, 'blend', 'e0fde828.blend')
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
        pul = None
        for ob in dst.objects:
            if ob:
                self.col.objects.link(ob)
                if ob.parent is None:
                    pul = ob
        pul.parent = fo
        s = 0.17 / 0.235
        pul.scale = (s, s, s)
        pul.rotation_euler = (math.pi / 2, 0, 0)
        pul.location = (0, -0.286, 0)
        dmp = MT.wrap_hide(MT.add_noise_rough(MT.principled('M_damper', (0.035, 0.035, 0.038), 0.7, 0.38), 120, 0.08), 'front_hide')
        for ob in dst.objects:
            if ob and ob.type == 'MESH':
                for slot in ob.material_slots:
                    slot.material = dmp if 'bolt' not in ob.name.lower() else self.M['crank_front']
        self.o['Pulley'] = pul
        # alvos dos moentes para as bielas
        self.pin_targets = {}
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            a = K.PIN_OFF[j] * D2R
            e = bpy.data.objects.new(f'Pin_{c}', None)
            e.empty_display_size = 0.01
            self.col.objects.link(e)
            e.parent = o
            e.location = (K.CR * math.sin(a), y, K.CR * math.cos(a))
            self.pin_targets[c] = e

    # ------------------------------------------------------------------ pistões e bielas
    def piston_mesh(self):
        H = K.COMP_H
        prof = [(0, -0.022), (0.0457, -0.022), (0.0462, -0.017), (0.0462, 0.0085), (0.0433, 0.0085), (0.0433, 0.0116),
                (0.0464, 0.0116), (0.0464, 0.0150), (0.0434, 0.0150), (0.0434, 0.0163), (0.0464, 0.0163), (0.0464, 0.0195),
                (0.0434, 0.0195), (0.0434, 0.0208), (0.0464, 0.0208), (0.0464, H - 0.0012), (0.0452, H), (0.03, H), (0.0, H - 0.0006)]
        me = G.lathe(prof, 96, 'piston', 30)
        po = G.new_obj('_pst', me, self.col)
        G.apply_bool(po, G.cylinder(0.0395, -0.05, 0.004, 64))
        G.apply_bool(po, cyl_y_mesh(0.0175, -0.034, 0.034, seg=40), 'UNION')
        G.apply_bool(po, cyl_y_mesh(0.0114, -0.06, 0.06, seg=40))
        for sy in (1, -1):
            G.apply_bool(po, G.box((-0.06, sy * 0.0345, -0.05), (0.06, sy * 0.08, 0.0045)))
        for sx in (1, -1):
            for sy in (1, -1):
                G.apply_bool(po, _tr(G.cylinder(0.0195, H - K.RELIEF, H + 0.01, 48), T((sx * K.VALVE_X, sy * K.VALVE_Y, 0))))
        me = po.data
        # material do revestimento da saia
        me.materials.append(self.M['piston'])
        me.materials.append(self.M['skirt'])
        me.materials.append(self.M['ring'])
        me.materials.append(self.M['chrome'])
        for p in me.polygons:
            c = p.center
            r = math.hypot(c.x, c.y)
            if c.z < 0.0045 and r > 0.044 and abs(p.normal.z) < 0.5:
                p.material_index = 1
        bpy.data.objects.remove(po)
        rings = [G.tube_ring(0.0436, 0.0465, z0, z1, 96) for (z0, z1) in ((0.0196, 0.0207), (0.0151, 0.0162), (0.0087, 0.0114))]
        rm = G.join_meshes(rings, 'rings')
        for p in rm.polygons:
            p.material_index = 2
        pin = cyl_y_mesh(0.0113, -0.031, 0.031, seg=32)
        for p in pin.polygons:
            p.material_index = 3
        bm = bmesh.new()
        for m in (me, rm, pin):
            bm.from_mesh(m)
        for m in (rm, pin):
            bpy.data.meshes.remove(m)
        bm.to_mesh(me)
        bm.free()
        G.smooth_mesh(me, 30)
        G.box_uv(me, 8)
        return me

    def rod_mesh(self):
        L = K.ROD
        big = cyl_y_mesh(0.040, -0.0105, 0.0105, seg=64)
        ro = G.new_obj('_rod', big, self.col)
        for sx in (1, -1):
            G.apply_bool(ro, G.box((sx * 0.026 if sx > 0 else -0.047, -0.0105, -0.024), (0.047 if sx > 0 else -0.026, 0.0105, 0.016)), 'UNION')
        beam = G.prism_xz([(-0.0135, 0.025), (0.0135, 0.025), (0.0092, L - 0.012), (-0.0092, L - 0.012)], -0.0105, 0.0105)
        G.apply_bool(ro, beam, 'UNION')
        G.apply_bool(ro, cyl_y_mesh(0.0185, -0.0102, 0.0102, 0, L, 48), 'UNION')
        for sy in (1, -1):
            pk = G.prism_xz([(-0.0085, 0.045), (0.0085, 0.045), (0.0052, L - 0.026), (-0.0052, L - 0.026)],
                            0.0045 if sy > 0 else -0.02, 0.02 if sy > 0 else -0.0045)
            G.apply_bool(ro, pk)
        G.apply_bool(ro, cyl_y_mesh(0.0267, -0.03, 0.03, seg=64))
        G.apply_bool(ro, cyl_y_mesh(0.0114, -0.03, 0.03, 0, L, 40))
        G.apply_bool(ro, G.box((-0.06, -0.03, -0.0004), (0.06, 0.03, 0.0004)))
        me = ro.data
        bpy.data.objects.remove(ro)
        me.materials.append(self.M['rod'])
        me.materials.append(self.M['bolt'])
        bolts = []
        for sx in (1, -1):
            b1 = _tr(G.cylinder(0.0042, -0.03, 0.012, 16), T((sx * 0.0365, 0, 0)))
            b2 = _tr(G.cylinder(0.0068, -0.0315, -0.024, 6), T((sx * 0.0365, 0, 0)))
            bolts += [b1, b2]
        bm_ = G.join_meshes(bolts, 'bolts')
        for p in bm_.polygons:
            p.material_index = 1
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.from_mesh(bm_)
        bpy.data.meshes.remove(bm_)
        bm.to_mesh(me)
        bm.free()
        G.smooth_mesh(me, 30)
        G.box_uv(me, 10)
        return me

    def pistons_rods(self):
        pm = self.piston_mesh()
        rm = self.rod_mesh()
        self.wrist = {}
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            p = G.new_obj(f'Piston_{c}', pm, self.col, self.root)
            p.rotation_euler = (0, K.BANK_ANG[b] * D2R, 0)
            self.o[p.name] = p
            w = bpy.data.objects.new(f'Wrist_{c}', None)
            w.empty_display_size = 0.01
            self.col.objects.link(w)
            w.parent = p
            self.wrist[c] = w
            r = G.new_obj(f'Rod_{c}', rm, self.col, self.root)
            cl = r.constraints.new('COPY_LOCATION')
            cl.target = self.pin_targets[c]
            dt = r.constraints.new('DAMPED_TRACK')
            dt.target = w
            dt.track_axis = 'TRACK_Z'
            G.add_bevel(r, 0.0006, 1, 50)
            self.o[r.name] = r

    # ------------------------------------------------------------------ trem de válvulas
    def valvetrain(self):
        M = self.M
        vmesh = {}
        for kind in 'IE':
            rh = K.VALVE_R[kind]
            prof = [(0, 0.0), (rh - 0.0006, 0.0), (rh, 0.0011), (rh - 0.0016, 0.0026)]
            for i in range(1, 9):
                t = i / 8
                r = (rh - 0.0016) + (0.0029 - (rh - 0.0016)) * (1 - (1 - t) ** 2.2)
                z = 0.0026 + 0.016 * t
                prof.append((r, z))
            prof += [(0.0029, 0.097), (0.0023, 0.0975), (0.0023, 0.0995), (0.0029, 0.1), (0.0029, 0.1035), (0.0026, K.VALVE_LEN), (0, K.VALVE_LEN)]
            v = G.lathe(prof, 48, 'valve_' + kind, 40)
            ret = G.lathe([(0.0031, 0.0915), (0.0112, 0.0915), (0.0112, 0.0935), (0.0055, 0.0965), (0.0031, 0.0965)], 40, 'ret', 40)
            buck = G.lathe([(0.0001, K.VALVE_LEN), (0.0144, K.VALVE_LEN), (0.0144, 0.088), (0.0155, 0.088), (0.0155, K.BUCKET_TOP - 0.0006),
                            (0.0149, K.BUCKET_TOP), (0, K.BUCKET_TOP)], 48, 'bucket', 40)
            for p in ret.polygons:
                p.material_index = 1
            for p in buck.polygons:
                p.material_index = 2
            bm = bmesh.new()
            for m in (v, ret, buck):
                bm.from_mesh(m)
            for m in (ret, buck):
                bpy.data.meshes.remove(m)
            bm.to_mesh(v)
            bm.free()
            G.smooth_mesh(v, 40)
            v.materials.append(M['valve'])
            v.materials.append(M['chrome'])
            v.materials.append(M['crank'])
            vmesh[kind] = v
        spring = G.helix(0.0112, 0.0017, 0.0, 0.0315, 5.5, 'spring')
        G.smooth_mesh(spring, 60)
        spring.materials.append(M['spring'])
        self.valves = {}
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            for kind in 'IE':
                for ys in (-1, 1):
                    S, d = self.valve_seat(kind, ys, y)
                    Sw = bankM(b) @ S
                    dw = bank_dir(b, d)
                    a = ang_of(dw)
                    nm = f'Valve_{c}{kind}{"a" if ys < 0 else "b"}'
                    vo = G.new_obj(nm, vmesh[kind], self.col, self.root)
                    vo.location = Sw
                    vo.rotation_euler = (0, a * D2R, 0)
                    sp = G.new_obj('Spring' + nm[5:], spring, self.col, self.root)
                    sp.location = Sw + dw * 0.0605
                    sp.rotation_euler = (0, a * D2R, 0)
                    self.valves[(c, kind, ys)] = dict(obj=vo, spring=sp, S=Sw, d=dw, cyl=c, kind=kind)
                    self.o[nm] = vo

    def camshafts(self):
        """lóbulos gerados a partir da curva de levantamento -> contato geométrico coerente"""
        M = self.M
        self.cams = {}
        nb = 360
        for b in 'RL':
            belt_y = -0.245 if b == 'R' else -0.268
            for kind in 'IE':
                C = self.cam_centers[(b, kind)]
                mes = [cyl_y_mesh(0.0125, belt_y, 0.212, seg=32)]
                ys = [K.cyl_info(c)[2] for c in cyls(b)]
                ribs = [ys[0] - 0.05] + [(ys[i] + ys[i + 1]) / 2 for i in range(3)] + [ys[-1] + 0.05]
                for ry in ribs:
                    mes.append(cyl_y_mesh(0.0134, ry - 0.0072, ry + 0.0072, seg=40))
                lobes = []
                for (key, v) in self.valves.items():
                    c, k2, ysn = key
                    if k2 != kind or K.cyl_info(c)[0] != b:
                        continue
                    f = -v['d']
                    df = ang_of(f)
                    # função-suporte desejada H(beta) = raio de base + levantamento; o perfil é a envoltória
                    # das faces do tucho: P = H*n + H'*t  (contato exato com tucho plano)
                    Hs = []
                    for i in range(nb):
                        beta = 360.0 * i / nb
                        th = 2 * (df - beta)
                        Hs.append(K.CAM_RB + K.valve_lift_profile(kind, (th - K.FIRE_ANGLE[c]) % 720))
                    dB = 2 * math.pi / nb
                    prof = []
                    for i in range(nb):
                        bb = 2 * math.pi * i / nb
                        Hp = (Hs[(i + 1) % nb] - Hs[i - 1]) / (2 * dB)
                        prof.append((Hs[i] * math.sin(bb) + Hp * math.cos(bb), Hs[i] * math.cos(bb) - Hp * math.sin(bb)))
                    yv = v['S'].y
                    mes.append(G.prism_xz(prof, yv - 0.0072, yv + 0.0072))
                    lobes.append((v, prof))
                spr = [toothed_disc(0.058, 0.0615, 42, belt_y - 0.0095, belt_y + 0.0095),
                       cyl_y_mesh(0.03, belt_y + 0.0095, belt_y + 0.016, seg=40),
                       cyl_y_mesh(0.0125, belt_y - 0.0095, -0.222, seg=32)]
                mes[0] = cyl_y_mesh(0.0125, -0.222, 0.212, seg=32)
                me = G.join_meshes(mes, f'Cam_{b}{kind}')
                G.smooth_mesh(me, 25)
                o = G.new_obj(f'Cam_{b}{kind}', me, self.col, self.root)
                me.materials.append(M['crank'])
                o.location = (C.x, 0, C.z)
                sm = G.join_meshes(spr, f'CamSprocket_{b}{kind}')
                G.smooth_mesh(sm, 25)
                so = G.new_obj(f'CamSprocket_{b}{kind}', sm, self.col, o)
                sm.materials.append(M['crank_front'])
                self.cams[(b, kind)] = dict(obj=o, C=C, lobes=lobes)
                self.o[o.name] = o

    def belts(self):
        self.belt_objs = {}
        self.belt_hulls = []
        for b in 'RL':
            belt_y = -0.245 if b == 'R' else -0.268
            pts = G.circle_pts(0, 0, 0.0318 + 0.002, 72)
            for kind in 'IE':
                C = self.cam_centers[(b, kind)]
                pts += G.circle_pts(C.x, C.z, 0.0615 + 0.002, 120)
            hull = G.convex_hull(pts)
            self.belt_hulls.append(hull)
            # reamostra
            path = [Vector((x, belt_y, z)) for (x, z) in hull]
            dense = []
            for i in range(len(path)):
                a, bb = path[i], path[(i + 1) % len(path)]
                n = max(1, int((bb - a).length / 0.003))
                for k in range(n):
                    dense.append(a.lerp(bb, k / n))
            prof = [(-1, -4.6), (1, -4.6), (1, 4.6), (-1, 4.6)]
            me = G.sweep(dense, 0.002, name=f'Belt_{b}', caps=False, closed=True, profile=prof)
            o = G.new_obj(f'Belt_{b}', me, self.col, self.root)
            me.materials.append(self.M['belt'])
            o['flow_len'] = me['length']
            o['belt_off'] = 0.0
            self.belt_objs[b] = o
            self.o[o.name] = o
        # tampa da distribuição
        pts = []
        for h in self.belt_hulls:
            for (x, z) in h:
                pts += G.circle_pts(x, z, 0.014, 6)
        outer = G.convex_hull(pts)
        pts = []
        for h in self.belt_hulls:
            for (x, z) in h:
                pts += G.circle_pts(x, z, 0.010, 6)
        inner = G.convex_hull(pts)
        tc = G.new_obj('TimingCover', G.prism_xz(outer, -0.287, -0.222), self.col, self.root)
        G.apply_bool(tc, G.prism_xz(inner, -0.283, -0.2))
        G.apply_bool(tc, cyl_y_mesh(0.027, -0.4, -0.1, seg=40))
        G.box_uv(tc.data)
        G.smooth_mesh(tc.data, 30)
        tc.data.materials.append(self.M['alu'])
        G.add_bevel(tc, 0.003, 2, 40)
        self.static.append(tc)
        self.o['TimingCover'] = tc

    # ------------------------------------------------------------------ coletores
    def runner_path(self, c):
        b, j, y = K.cyl_info(c)
        F = bank_pt(b, 0.098, y, K.DECK + 0.055)
        din = bank_dir(b, (1, 0, 0.12))
        sx = -1 if b == 'R' else 1
        return [F, F + din * 0.035, Vector((sx * 0.085, y, 0.345)), Vector((sx * 0.058, y, 0.395)), Vector((sx * 0.045, y, 0.42))]

    def intake(self):
        pl = G.new_obj('IntakeManifold', G.prism_xz(G.rounded_rect(0, 0.42, 0.17, 0.10, 0.03), -0.205, 0.205), self.col, self.root)
        for c in range(1, 9):
            G.apply_bool(pl, G.sweep(G.catmull(self.runner_path(c), 10), 0.0195, 32), 'UNION')
        G.apply_bool(pl, cyl_y_mesh(0.043, -0.262, -0.2, 0, 0.42, 48), 'UNION')
        G.apply_bool(pl, G.prism_xz(G.rounded_rect(0, 0.42, 0.16, 0.09, 0.025), -0.2, 0.2))
        for c in range(1, 9):
            pth = self.runner_path(c)
            b = K.cyl_info(c)[0]
            ext = [pth[0] - bank_dir(b, (1, 0, 0.12)) * 0.01] + pth[1:] + [pth[-1] + Vector((0, 0, 0.03))]
            G.apply_bool(pl, G.sweep(G.catmull(ext, 10), 0.0156, 28))
        G.apply_bool(pl, cyl_y_mesh(0.037, -0.3, -0.19, 0, 0.42, 48))
        G.box_uv(pl.data)
        G.smooth_mesh(pl.data, 35)
        pl.data.materials.append(self.M['plastic'])
        G.add_bevel(pl, 0.0015, 1, 50)
        self.static.append(pl)
        self.o['IntakeManifold'] = pl
        # borboleta
        bf = cyl_y_mesh(0.0365, -0.0012, 0.0012, seg=40)
        bfo = self.add('Throttle', bf, self.M['valve'], uv=None)
        bfo.location = (0, -0.24, 0.42)
        bfo.rotation_euler = (0, 0, 0.35)
        self.static.append(bfo)

    def header_path(self, c):
        b, j, y = K.cyl_info(c)
        sx = -1 if b == 'R' else 1
        P0 = bank_pt(b, -0.097, y, K.DECK + 0.040)
        out = bank_dir(b, (-1, 0, 0))
        jj = (c - 1) % 4
        return [P0, P0 + out * 0.045, Vector((sx * 0.33, y, 0.0)), Vector((sx * 0.31, 0.6 * y + 0.13, -0.09)),
                Vector((sx * (0.262 + 0.006 * (jj % 2)), 0.30 + 0.004 * (jj // 2), -0.128))]

    def exhaust(self):
        for b in 'RL':
            mes = []
            for c in cyls(b):
                mes.append(G.sweep(G.catmull(self.header_path(c), 12), 0.0195, 32, caps=False))
            sx = -1 if b == 'R' else 1
            mes.append(G.sweep(G.catmull([Vector((sx * 0.265, 0.29, -0.126)), Vector((sx * 0.255, 0.45, -0.145)), Vector((sx * 0.24, 0.66, -0.16))], 10), 0.031, 40, caps=False))
            o = self.add('Header_' + b, G.join_meshes(mes, 'Header_' + b), self.M['header'], static=True, uv=None)
            sm = o.modifiers.new('solid', 'SOLIDIFY')
            sm.thickness = 0.0022
            sm.offset = -1
            sm.use_rim = True
            # modificador sólido precisa vir antes do corte -> booleana adicionada depois

    # ------------------------------------------------------------------ gases, faíscas e fluxos
    def fx(self):
        self.gas = {}
        self.sparks = {}
        for c in range(1, 9):
            b, j, y = K.cyl_info(c)
            col = G.cylinder(K.RB - 0.0007, -1.0, 0.0, 48)
            go = G.new_obj(f'GasCol_{c}', col, self.col, self.root)
            go.location = bank_pt(b, 0, y, K.DECK)
            go.rotation_euler = (0, K.BANK_ANG[b] * D2R, 0)
            go.data.materials.append(self.M['gas'])
            roof = self.chamber_cutter(y, inset=0.0008, z_bottom=K.DECK - 0.0004)
            G.transform_mesh(roof, bankM(b))
            ro = G.new_obj(f'GasRoof_{c}', roof, self.col, self.root)
            ro.data.materials.append(self.M['gas'])
            for o in (go, ro):
                o.visible_shadow = False
                for k in ['gas_fresh', 'gas_hot', 'gas_burned', 'gas_bright', 'flame_r', 'flame_front']:
                    o[k] = 0.0
                o['gas_vis'] = 1.0
            self.gas[c] = (go, ro)
            # centelha
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.0016)
            sp = G.new_obj(f'Spark_{c}', G.bm_to_mesh(bm, 'spark'), self.col, self.root)
            sp.location = self.plug_tips[c] - bank_dir(b, (0, 0, 1)) * 0.0012
            sp.data.materials.append(self.M['spark'])
            sp['spark'] = 0.0
            sp.visible_shadow = False
            self.sparks[c] = sp
        # fluxos do cilindro 1 (admissão e escape)
        c = 1
        b, j, y = K.cyl_info(c)
        self.flows = {}
        for kind in 'IE':
            objs = []
            for k, (dy, dz) in enumerate([(0.004, 0.0), (0.009, 0.004), (0.006, -0.005), (0.012, -0.002), (0.003, 0.006)]):
                if kind == 'I':
                    run = list(reversed(self.runner_path(c)))[:-1]
                    run = [p + Vector((0, dy, 0)) for p in run]
                    port = [bank_pt(b, 0.098, y + dy, K.DECK + 0.055 + dz), bank_pt(b, 0.06, y + dy, K.DECK + 0.046 + dz),
                            bank_pt(b, 0.034, y + dy, K.DECK + 0.03 + dz * 0.6), bank_pt(b, 0.02 + dz, y + dy, K.DECK + 0.006),
                            bank_pt(b, 0.004 + dz, y + dy, K.DECK - 0.014), bank_pt(b, -0.018 + dz, y + dy * 0.5, K.DECK - 0.03)]
                    pts = [Vector((run[0].x * 0.2, run[0].y, 0.445))] + run + port
                else:
                    port = [bank_pt(b, 0.012 + dz, y + dy, K.DECK - 0.022), bank_pt(b, -0.012 + dz, y + dy, K.DECK - 0.004),
                            bank_pt(b, -0.024, y + dy, K.DECK + 0.012 + dz * 0.5), bank_pt(b, -0.04, y + dy, K.DECK + 0.03 + dz * 0.6),
                            bank_pt(b, -0.075, y + dy, K.DECK + 0.038 + dz), bank_pt(b, -0.098, y + dy, K.DECK + 0.040 + dz)]
                    hp = self.header_path(c)[1:]
                    pts = port + [p + Vector((0, dy, dz)) for p in hp]
                me = G.sweep(G.catmull(pts, 14), 0.0011 + 0.0004 * (k % 2), 8, f'Flow{kind}_{k}', caps=True)
                o = G.new_obj(f'Flow{kind}_{k}', me, self.col, self.root)
                o.data.materials.append(self.M['flow_in' if kind == 'I' else 'flow_ex'])
                o['flow_len'] = me['length']
                o['flow_off'] = 0.0
                o['flow_amt'] = 0.0
                o.visible_shadow = False
                objs.append(o)
            self.flows[kind] = objs
        # jato do injetor (porta) — cone de névoa no duto de admissão do cilindro 1
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.0012, radius2=0.011, depth=0.04)
        for v in bm.verts:
            v.co.z += 0.02
        sm = G.bm_to_mesh(bm, 'spray')
        so = G.new_obj('Spray_1', sm, self.col, self.root)
        so.data.materials.append(self.M['spray'])
        P = bank_pt(b, 0.085, y, K.DECK + 0.085)
        tgt = bank_pt(b, 0.03, y, K.DECK + 0.03)
        dvec = (tgt - P).normalized()
        so.location = P
        so.rotation_euler = (0, math.atan2(dvec.x, dvec.z), 0)
        so['flow_amt'] = 0.0
        so.visible_shadow = False
        self.spray = so
        # injetor (peça estática)
        inj = _tr(G.cylinder(0.0055, -0.045, 0.0, 20), T((0, 0, 0)))
        inj.transform(T(P) @ RY(math.degrees(math.atan2(dvec.x, dvec.z))))
        mes = [inj]
        for c2 in range(1, 9):
            b2, j2, y2 = K.cyl_info(c2)
            if c2 == 1:
                continue
            P2 = bank_pt(b2, 0.085, y2, K.DECK + 0.085)
            t2 = bank_pt(b2, 0.03, y2, K.DECK + 0.03)
            d2 = (t2 - P2).normalized()
            m2 = G.cylinder(0.0055, -0.045, 0.0, 20)
            m2.transform(T(P2) @ RY(math.degrees(math.atan2(d2.x, d2.z))))
            mes.append(m2)
        self.add('Injectors', G.join_meshes(mes, 'Injectors'), self.M['plastic'], static=True, smooth=40)

    def anchors(self):
        """pontos para a camada de motion graphics (projeção 2D no Remotion)"""
        A = {}

        def emp(name, parent, loc):
            e = bpy.data.objects.new('A_' + name, None)
            e.empty_display_size = 0.005
            self.col.objects.link(e)
            e.parent = parent
            e.location = loc
            A[name] = e
        b, j, y = K.cyl_info(1)
        emp('piston1', self.o['Piston_1'], (0, -0.046, K.COMP_H - 0.012))
        emp('rod1', self.o['Rod_1'], (0, -0.011, K.ROD * 0.55))
        emp('crank', self.o['Crankshaft'], (0.0, -0.2, -0.05))
        emp('plug1', self.root, self.plug_tips[1] + bank_dir('R', (0, 0, 1)) * 0.045 + Vector((0, -0.01, 0)))
        v = self.valves[(1, 'I', -1)]
        emp('valveI1', v['obj'], (0, 0, 0.03))
        v = self.valves[(1, 'E', -1)]
        emp('valveE1', v['obj'], (0, 0, 0.03))
        emp('camI', self.root, self.cam_centers[('R', 'I')] + Vector((0, -0.16, 0)))
        emp('intake', self.root, Vector((0, 0.0, 0.47)))
        emp('header', self.root, Vector((-0.33, -0.12, 0.0)))
        emp('chamber1', self.root, bank_pt('R', 0, y, K.DECK + 0.004))
        for c in range(1, 9):
            bb, jj, yy = K.cyl_info(c)
            emp(f'cyl{c}', self.root, bank_pt(bb, 0, yy, K.DECK + 0.21))
        self.anchor_objs = A

    def build(self):
        self.materials()
        self.block()
        self.heads()
        self.ignition()
        self.crankshaft()
        self.pistons_rods()
        self.valvetrain()
        self.camshafts()
        self.belts()
        self.intake()
        self.exhaust()
        self.fx()
        self.anchors()
        return self


def _tr(me, M):
    me.transform(M)
    return me
