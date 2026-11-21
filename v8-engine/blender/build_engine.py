"""Procedural V8 (engine frame, parented to an empty 'ENGINE')."""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector
import meshkit as mk
from v8kin import (R, L, CH, DECK, RB, PIN_Y, MAIN_Y, STAG, CYLS, side, beta, pin, cyl_y, bank_U, bank_W,
                   valve_axis, valve_seat, valve_seat_uw, cam_centre, cam_lobe_angle, CAM_BASE, CAM_NOSE_R,
                   CAM_NOSE_D, IN_HEAD_R, EX_HEAD_R, STEM_LEN, BUCKET_H, ROOF_H, VALVE_TILT, PLUG_DY, IN_PEAK,
                   EX_PEAK, OFF)

Y_CUT = cyl_y(1)           # section plane (through cylinder 1 axis)
BLOCK_Y = (-0.222, 0.222)
HEAD_Y = (-0.208, 0.208)
HEAD_TOP = DECK + 0.115
COVER_TOP = DECK + 0.192
CHAIN_PITCH = 0.00635
N_CRANK_SPR, N_CAM_SPR = 28, 56
R_CRANK_SPR = CHAIN_PITCH / (2 * math.sin(math.pi / N_CRANK_SPR))
R_CAM_SPR = CHAIN_PITCH / (2 * math.sin(math.pi / N_CAM_SPR))
GEAR_R, GEAR_N = 0.047, 36
CHAIN_Y = {1: -0.245, -1: -0.230}     # chain plane per bank side
GEAR_Y = {1: -0.226, -1: -0.205}
PULLEY_Y = -0.292


def bank_M(s):
    """local (x=w outward, y, z=u) -> engine; bank stagger included."""
    c = 1 if s > 0 else 2
    U, W = Vector(bank_U(c)), Vector(bank_W(c))
    return Matrix(((W.x, 0, U.x, 0), (0, 1, 0, -STAG * s), (W.z, 0, U.z, 0), (0, 0, 0, 1)))


def rot_y(a):
    return Matrix.Rotation(a, 4, 'Y')


def align_z(v):
    """Matrix rotating +Z onto v (v in XZ plane) -> rotation about Y."""
    return rot_y(math.atan2(v[0], v[2]))


def recalc(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def gear_poly(n, r_pitch, depth, tip_frac=0.35, root_frac=0.55, phase=0.0):
    pts = []
    ro, ri = r_pitch + depth * 0.45, r_pitch - depth * 0.55
    for i in range(n):
        a0 = phase + 2 * math.pi * i / n
        da = 2 * math.pi / n
        pts.append((ri * math.sin(a0), ri * math.cos(a0)))
        pts.append((ri * math.sin(a0 + da * (root_frac - 0.1) / 2 + 0.0), ri * math.cos(a0 + da * (root_frac - 0.1) / 2)))
        pts.append((ro * math.sin(a0 + da * (0.5 - tip_frac / 2)), ro * math.cos(a0 + da * (0.5 - tip_frac / 2))))
        pts.append((ro * math.sin(a0 + da * (0.5 + tip_frac / 2)), ro * math.cos(a0 + da * (0.5 + tip_frac / 2))))
        pts.append((ri * math.sin(a0 + da * (1 - (root_frac - 0.1) / 2)), ri * math.cos(a0 + da * (1 - (root_frac - 0.1) / 2))))
    return pts


def add_gear(bm, n, r_pitch, depth, y0, y1, center=(0, 0), hub_r=None, mat_index=0, holes=0):
    poly = gear_poly(n, r_pitch, depth)
    poly = [(p[0] + center[0], p[1] + center[1]) for p in poly]
    mk.add_prism(bm, poly, y0, y1, mat_index=mat_index)


def chamber_bm(r, roof_off=0.0, depth_below=0.002, seg=64):
    """Pent-roof combustion chamber volume in bank-local frame (x=w, z=u)."""
    bm = bmesh.new()
    mk.add_cyl(bm, r, ROOF_H + depth_below + 0.02, seg=seg, mat=Matrix.Translation((0, 0, DECK - depth_below)))
    t = math.radians(VALVE_TILT)
    apex = Vector((0, 0, DECK + ROOF_H - roof_off))
    for sgn in (-1, 1):
        n = Vector((sgn * math.sin(t), 0, math.cos(t)))
        res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=apex, plane_no=n, clear_outer=True)
        cut_edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
    recalc(bm)
    return bm


class Engine:
    def __init__(self, M, root):
        self.M = M          # material dict
        self.root = root
        self.static = []    # ghostable static parts (to split at Y_CUT)
        self.front_only = []  # parts that live entirely in front of the cut (hide in section)
        self.parts = {}
        self.port_paths = {}

    # ------------------------------------------------------------------
    def obj(self, name, bm, mats, smooth=35, uv=6.0, static=True, bev=None):
        recalc(bm)
        o = mk.new_obj(name, bm, mats, smooth_angle=smooth, parent=self.root, uv_scale=uv)
        if bev:
            mk.bevel(o, width=bev, segments=2)
        if static:
            self.static.append(o)
        return o

    # ------------------------------------------------------------------
    def block(self):
        M = self.M
        bm = bmesh.new()
        prof = [(-0.125, -0.105), (0.125, -0.105), (0.125, -0.093), (0.116, -0.086), (0.116, 0.027),
                (0.2047, 0.117), (0.117, 0.2047), (0.034, 0.122), (-0.034, 0.122), (-0.117, 0.2047),
                (-0.2047, 0.117), (-0.116, 0.027), (-0.116, -0.086), (-0.125, -0.093)]
        mk.add_prism(bm, prof, BLOCK_Y[0], BLOCK_Y[1])
        blk = self.obj('Block', bm, [M['block'], M['bore'], M['section']], static=False)
        mk.bevel(blk, 0.004, 2, 50)
        mk.apply_mods(blk)
        # cutter: bores + crank bays + main bore
        cb = bmesh.new()
        for c in CYLS:
            U = Vector(bank_U(c))
            base = Vector((0, cyl_y(c), 0)) + U * 0.07
            mk.add_cyl(cb, RB, DECK + 0.02 - 0.07, seg=64, mat=Matrix.Translation(base) @ align_z(U), mat_index=1)
        for py in PIN_Y:
            mk.add_cyl(cb, 0.094, 0.074, seg=48, mat=Matrix.Translation((0, py - 0.037, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
            mk.add_box(cb, (0.21, 0.074, 0.2), center=(0, py, -0.1), mat_index=1)
        mk.add_cyl(cb, 0.034, 0.6, seg=48, mat=Matrix.Translation((0, -0.3, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        cut = self.obj('BlockCut', cb, [M['block'], M['bore'], M['section']], static=False)
        mk.boolean(blk, cut)
        mk.remove(cut)
        self.static.append(blk)
        # side ribs + head-bolt bosses (cosmetic)
        bm = bmesh.new()
        for x in (-1, 1):
            for yy in (-0.15, -0.05, 0.05, 0.15):
                mk.add_box(bm, (0.012, 0.012, 0.1), center=(x * 0.12, yy, -0.04))
        rib = self.obj('BlockRibs', bm, [M['block'], M['bore'], M['section']], bev=0.002)
        # oil pan
        bm = bmesh.new()
        mk.add_prism(bm, [(-0.125, -0.104), (0.125, -0.104), (0.12, -0.16), (0.092, -0.212), (-0.092, -0.212), (-0.12, -0.16)], -0.214, 0.2)
        mk.add_box(bm, (0.262, 0.44, 0.01), center=(0, -0.007, -0.108))
        pan = self.obj('OilPan', bm, [M['pan'], M['bore'], M['section']], bev=0.004)
        return blk

    # ------------------------------------------------------------------
    def heads(self):
        M = self.M
        t = math.radians(VALVE_TILT)
        for s in (1, -1):
            BM = bank_M(s)
            bm = bmesh.new()
            mk.add_box(bm, (0.16, HEAD_Y[1] - HEAD_Y[0], HEAD_TOP - DECK), center=(0.002, 0, (DECK + HEAD_TOP) / 2), mat=BM)
            head = self.obj(f'Head_{s:+d}', bm, [M['head'], M['bore'], M['section']], static=False)
            mk.bevel(head, 0.004, 2, 50)
            mk.apply_mods(head)
            cb = bmesh.new()
            for i in range(4):
                c = (2 * i + 1) if s > 0 else (2 * i + 2)
                yl = PIN_Y[i]
                Tc = BM @ Matrix.Translation((0, yl, 0))
                ch = chamber_bm(RB)
                for f in ch.faces:
                    f.material_index = 1
                bmesh.ops.transform(ch, matrix=Tc, verts=ch.verts)
                me = bpy.data.meshes.new('tmp')
                ch.to_mesh(me)
                ch.free()
                cb.from_mesh(me)
                bpy.data.meshes.remove(me)
                for kind in ('in', 'ex'):
                    u0, w0 = valve_seat_uw(kind)
                    sgn = -1 if kind == 'in' else 1
                    a = Vector((sgn * math.sin(t), 0, math.cos(t)))
                    seat = Vector((w0, yl, u0))
                    # stem guide + bucket bore
                    mk.add_cyl(cb, 0.0045, 0.075, seg=16, mat=BM @ Matrix.Translation(seat) @ align_z(a), mat_index=1)
                    mk.add_cyl(cb, 0.0175, 0.09, seg=32, mat=BM @ Matrix.Translation(seat + a * 0.056) @ align_z(a), mat_index=1)
                    # port
                    if kind == 'in':
                        pts = mk.bezier_pts(seat - a * 0.004, seat + a * 0.03, Vector((-0.055, yl, DECK + 0.052)), Vector((-0.11, yl, DECK + 0.052)), 20)
                        rr = 0.0165
                    else:
                        pts = mk.bezier_pts(seat - a * 0.004, seat + a * 0.027, Vector((0.058, yl, DECK + 0.04)), Vector((0.11, yl, DECK + 0.038)), 20)
                        rr = 0.0145
                    pts = [BM @ p for p in pts]
                    self.port_paths[(c, kind)] = pts
                    mk.sweep_tube(cb, pts, rr, seg=28, mat_index=1)
                # spark plug bore
                mk.add_cyl(cb, 0.0072, 0.04, seg=24, mat=BM @ Matrix.Translation((0, yl + PLUG_DY, DECK + ROOF_H - 0.004)), mat_index=1)
                mk.add_cyl(cb, 0.0118, 0.2, seg=24, mat=BM @ Matrix.Translation((0, yl + PLUG_DY, DECK + 0.03)), mat_index=1)
            cut = self.obj('HeadCut', cb, [M['head'], M['bore'], M['section']], static=False, uv=6.0)
            mk.boolean(head, cut)
            mk.remove(cut)
            self.static.append(head)
            # cam towers (bearing caps) between cylinders
            bm = bmesh.new()
            for kind in ('in', 'ex'):
                c = 1 if s > 0 else 2
                cc = Vector(cam_centre(c, kind))
                # local coords of cam centre
                inv = BM.inverted()
                lc = inv @ Vector((cc.x, cyl_y(c), cc.z))
                for yy in (-0.2, -0.1, 0.0, 0.1, 0.2):
                    mk.add_box(bm, (0.04, 0.016, lc.z + 0.02 - HEAD_TOP), center=(lc.x, yy, (HEAD_TOP + lc.z + 0.02) / 2), mat=BM)
            tw = self.obj(f'CamTowers_{s:+d}', bm, [M['head'], M['bore'], M['section']], bev=0.002)
            mk.apply_mods(tw)
            cb = bmesh.new()
            for kind in ('in', 'ex'):
                c = 1 if s > 0 else 2
                cc = cam_centre(c, kind)
                mk.add_cyl(cb, 0.0135, 0.6, seg=32, mat=Matrix.Translation((cc[0], -0.3, cc[2])) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
            cut = self.obj('TowerCut', cb, [M['head'], M['bore'], M['section']], static=False)
            mk.boolean(tw, cut)
            mk.remove(cut)
            # valve cover (shell)
            bm = bmesh.new()
            mk.add_box(bm, (0.152, HEAD_Y[1] - HEAD_Y[0] + 0.004, COVER_TOP - HEAD_TOP), center=(0.003, 0, (HEAD_TOP + COVER_TOP) / 2), mat=BM)
            vc = self.obj(f'ValveCover_{s:+d}', bm, [M['cover'], M['cover_in'], M['section']], static=False)
            mk.bevel(vc, 0.014, 4, 50, harden=False)
            mk.apply_mods(vc)
            cb = bmesh.new()
            mk.add_box(cb, (0.142, HEAD_Y[1] - HEAD_Y[0] - 0.006, COVER_TOP - HEAD_TOP), center=(0.003, 0, (HEAD_TOP + COVER_TOP) / 2 - 0.006), mat=BM, mat_index=1)
            for i in range(4):
                mk.add_cyl(cb, 0.0118, 0.3, seg=24, mat=BM @ Matrix.Translation((0, PIN_Y[i] + PLUG_DY, DECK + 0.03)), mat_index=1)
            cut = self.obj('CoverCut', cb, [M['cover'], M['cover_in'], M['section']], static=False)
            mk.boolean(vc, cut)
            mk.remove(cut)
            self.static.append(vc)
            # cover ribs + coil packs
            bm = bmesh.new()
            for xw in (-0.05, 0.055):
                mk.add_box(bm, (0.006, 0.36, 0.005), center=(xw, 0, COVER_TOP + 0.0005), mat=BM)
            for i in range(4):
                yl = PIN_Y[i] + PLUG_DY
                mk.add_box(bm, (0.05, 0.03, 0.03), center=(0.0, yl, COVER_TOP + 0.012), mat=BM)
                mk.add_cyl(bm, 0.012, 0.03, seg=24, mat=BM @ Matrix.Translation((0, yl, COVER_TOP - 0.01)))
                mk.add_box(bm, (0.018, 0.014, 0.016), center=(0.028, yl, COVER_TOP + 0.02), mat=BM)
                mk.add_cyl(bm, 0.0088, COVER_TOP - DECK - 0.085, seg=20, mat=BM @ Matrix.Translation((0, yl, DECK + 0.085)))
            self.obj(f'Coils_{s:+d}', bm, [M['coil'], M['bore'], M['section']], bev=0.003)
            # gas tube for plug (plug well) visible in section -> part of head cut already

    # ------------------------------------------------------------------
    def intake(self):
        M = self.M
        # plenum shell
        bm = bmesh.new()
        mk.add_box(bm, (0.17, 0.39, 0.105), center=(0, -0.005, 0.358))
        pl = self.obj('Plenum', bm, [M['intake'], M['intake_in'], M['section']], static=False)
        mk.bevel(pl, 0.03, 5, 50, harden=False)
        mk.apply_mods(pl)
        cb = bmesh.new()
        mk.add_box(cb, (0.162, 0.382, 0.097), center=(0, -0.005, 0.358), mat_index=1)
        mk.add_cyl(cb, 0.034, 0.1, seg=32, mat=Matrix.Translation((0, -0.26, 0.365)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        cut = self.obj('PlenumCut', cb, [M['intake'], M['intake_in'], M['section']], static=False)
        mk.boolean(pl, cut)
        mk.remove(cut)
        self.static.append(pl)
        # runners (hollow) + injectors + fuel rails
        bm = bmesh.new()
        self.runner_paths = {}
        for c in CYLS:
            W = Vector(bank_W(c))
            U = Vector(bank_U(c))
            y = cyl_y(c)
            exitp = Vector((0, y, 0)) + U * (DECK + 0.052) - W * 0.078
            p0 = exitp + W * 0.012
            p1 = exitp - W * 0.06
            p2 = Vector((math.copysign(0.07, exitp.x), y, 0.25))
            p3 = Vector((math.copysign(0.035, exitp.x), y, 0.335))
            pts = mk.bezier_pts(p0, p1, p2, p3, 22)
            self.runner_paths[c] = pts
            mk.sweep_tube(bm, pts, 0.0185, seg=28, closed_ends=False)
        rn = self.obj('Runners', bm, [M['intake'], M['intake_in'], M['section']], uv=6.0)
        sol = rn.modifiers.new('Solid', 'SOLIDIFY')
        sol.thickness = 0.0025
        sol.offset = 1.0
        sol.use_even_offset = True
        mk.apply_mods(rn)
        # flanges where runners meet heads
        bm = bmesh.new()
        for s in (1, -1):
            BM = bank_M(s)
            mk.add_box(bm, (0.012, HEAD_Y[1] - HEAD_Y[0] - 0.01, 0.05), center=(-0.084, 0, DECK + 0.052), mat=BM)
        fl = self.obj('IntakeFlanges', bm, [M['intake'], M['intake_in'], M['section']], bev=0.002)
        cb = bmesh.new()
        for c in CYLS:
            W, U = Vector(bank_W(c)), Vector(bank_U(c))
            exitp = Vector((0, cyl_y(c), 0)) + U * (DECK + 0.052) - W * 0.078
            mk.add_cyl(cb, 0.0165, 0.05, seg=28, mat=Matrix.Translation(exitp + W * 0.02) @ align_z(-W), mat_index=1)
        cut = self.obj('FlCut', cb, [M['intake'], M['intake_in'], M['section']], static=False)
        mk.boolean(fl, cut)
        mk.remove(cut)
        # injectors + rails
        bm = bmesh.new()
        self.injectors = {}
        for c in CYLS:
            W, U = Vector(bank_W(c)), Vector(bank_U(c))
            y = cyl_y(c)
            tip = Vector((0, y, 0)) + U * (DECK + 0.064) - W * 0.07
            d = (U * 0.8 - W * 0.2).normalized()
            body0 = tip + d * 0.004
            mk.add_cyl(bm, 0.0055, 0.05, seg=20, mat=Matrix.Translation(body0) @ align_z(d))
            self.injectors[c] = (tip, -d)
        for s in (1, -1):
            c = 1 if s > 0 else 2
            W, U = Vector(bank_W(c)), Vector(bank_U(c))
            p = U * (DECK + 0.064) - W * 0.07 + (U * 0.8 - W * 0.2).normalized() * 0.056
            mk.add_cyl(bm, 0.008, 0.42, seg=24, mat=Matrix.Translation((p.x, -0.215, p.z)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        self.obj('FuelRails', bm, [M['rail'], M['bore'], M['section']], bev=0.001)
        # throttle body + intake tube
        bm = bmesh.new()
        mk.add_cyl(bm, 0.043, 0.05, seg=48, mat=Matrix.Translation((0, -0.25, 0.365)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        tb = self.obj('Throttle', bm, [M['throttle'], M['bore'], M['section']], static=False, bev=0.002)
        mk.apply_mods(tb)
        cb = bmesh.new()
        mk.add_cyl(cb, 0.036, 0.2, seg=48, mat=Matrix.Translation((0, -0.35, 0.365)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        cut = self.obj('TbCut', cb, [M['throttle'], M['bore'], M['section']], static=False)
        mk.boolean(tb, cut)
        mk.remove(cut)
        self.front_only.append(tb)
        self.static.append(tb)
        # "V8" lettering on plenum
        cu = bpy.data.curves.new('V8txt', 'FONT')
        cu.body = 'V8'
        cu.size = 0.07
        cu.extrude = 0.0025
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.bevel_depth = 0.0006
        try:
            cu.font = bpy.data.fonts.load('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
        except Exception:
            pass
        tx = bpy.data.objects.new('V8Letters', cu)
        mk.link(tx)
        tx.parent = self.root
        tx.location = (0, -0.03, 0.4135)
        tx.data.materials.append(M['letters'])
        self.parts['letters'] = tx

    # ------------------------------------------------------------------
    def exhaust(self):
        M = self.M
        bm = bmesh.new()
        self.header_paths = {}
        for c in CYLS:
            W, U = Vector(bank_W(c)), Vector(bank_U(c))
            y = cyl_y(c)
            s = side(c)
            exitp = Vector((0, y, 0)) + U * (DECK + 0.038) + W * 0.082
            p0 = exitp - W * 0.012
            p1 = exitp + W * 0.07
            p2 = Vector((s * 0.33, y + 0.02, 0.03))
            p3 = Vector((s * 0.285, 0.25, -0.05))
            pts = mk.bezier_pts(p0, p1, p2, p3, 26)
            pts += [Vector((s * 0.285, 0.25 + 0.02 * k, -0.05 - 0.004 * k)) for k in range(1, 3)]
            self.header_paths[c] = pts
            mk.sweep_tube(bm, pts, 0.0175, seg=28, closed_ends=False)
        hd = self.obj('Headers', bm, [M['header'], M['header_in'], M['section']], uv=8.0)
        sol = hd.modifiers.new('Solid', 'SOLIDIFY')
        sol.thickness = 0.0018
        sol.offset = 1.0
        mk.apply_mods(hd)
        bm = bmesh.new()
        for s in (1, -1):
            mk.add_cyl(bm, 0.034, 0.32, seg=40, mat=Matrix.Translation((s * 0.285, 0.27, -0.055)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
            BM = bank_M(s)
            mk.add_box(bm, (0.01, HEAD_Y[1] - HEAD_Y[0] - 0.01, 0.045), center=(0.087, 0, DECK + 0.038), mat=BM)
        col = self.obj('Collectors', bm, [M['header'], M['header_in'], M['section']], bev=0.002)
        cb = bmesh.new()
        for c in CYLS:
            W, U = Vector(bank_W(c)), Vector(bank_U(c))
            exitp = Vector((0, cyl_y(c), 0)) + U * (DECK + 0.038) + W * 0.082
            mk.add_cyl(cb, 0.0158, 0.05, seg=28, mat=Matrix.Translation(exitp - W * 0.02) @ align_z(W), mat_index=1)
        cut = self.obj('ColCut', cb, [M['header'], M['header_in'], M['section']], static=False)
        mk.boolean(col, cut)
        mk.remove(cut)

    # ------------------------------------------------------------------
    def front(self):
        """Timing cover, accessory drive (belt + pulleys) – front-only parts."""
        M = self.M
        pts = mk.circle_pts(0, 0, 0.072, 48)
        for s in (1, -1):
            c = 1 if s > 0 else 2
            for kind in ('in', 'ex'):
                cc = cam_centre(c, kind)
                pts += mk.circle_pts(cc[0], cc[2], 0.07, 48)
        hull = mk.hull2d(pts)
        bm = bmesh.new()
        mk.add_prism(bm, hull, -0.268, -0.196)
        tc = self.obj('TimingCover', bm, [M['cover2'], M['bore'], M['section']], bev=0.006)
        self.front_only.append(tc)
        # accessory pulleys positions (x, z, r)
        self.acc = {'damper': (0.0, 0.0, 0.088), 'wp': (0.0, 0.205, 0.058), 'alt': (-0.215, 0.13, 0.032),
                    'idler': (0.165, 0.11, 0.036), 'tens': (0.105, -0.05, 0.03)}
        order = ['damper', 'tens', 'idler', 'wp', 'alt']
        # belt (ribbon around hull of pulleys; idler/tensioner on outside approximated)
        bp = []
        for k in order:
            x, z, r = self.acc[k]
            bp += mk.circle_pts(x, z, r + 0.003, 64)
        h = mk.hull2d(bp)
        bm = bmesh.new()
        n = len(h)
        y0, y1 = PULLEY_Y - 0.012, PULLEY_Y + 0.012
        cx = sum(p[0] for p in h) / n
        cz = sum(p[1] for p in h) / n
        vi, vo = [], []
        for p in h:
            d = Vector((p[0] - cx, p[1] - cz)).normalized()
            vi.append((bm.verts.new((p[0], y0, p[1])), bm.verts.new((p[0], y1, p[1]))))
            vo.append((bm.verts.new((p[0] + d.x * 0.005, y0, p[1] + d.y * 0.005)), bm.verts.new((p[0] + d.x * 0.005, y1, p[1] + d.y * 0.005))))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((vi[i][0], vi[j][0], vi[j][1], vi[i][1]))
            bm.faces.new((vo[i][0], vo[i][1], vo[j][1], vo[j][0]))
            bm.faces.new((vi[i][0], vo[i][0], vo[j][0], vi[j][0]))
            bm.faces.new((vi[i][1], vi[j][1], vo[j][1], vo[i][1]))
        belt = self.obj('Belt', bm, [M['rubber'], M['bore'], M['section']], smooth=50)
        self.front_only.append(belt)
        # alternator + water pump bodies
        bm = bmesh.new()
        x, z, r = self.acc['alt']
        mk.add_cyl(bm, 0.062, 0.11, seg=48, mat=Matrix.Translation((x - 0.03, PULLEY_Y + 0.02, z + 0.0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        x, z, r = self.acc['wp']
        mk.add_cyl(bm, 0.045, 0.05, seg=40, mat=Matrix.Translation((x, PULLEY_Y + 0.015, z)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        acc = self.obj('Accessories', bm, [M['cover2'], M['bore'], M['section']], bev=0.003)
        self.front_only.append(acc)

    # ------------------------------------------------------------------
    def pistons(self):
        M = self.M
        bm = bmesh.new()
        rr = RB - 0.0004
        mk.add_cyl(bm, rr, CH + 0.024, seg=64, mat=Matrix.Translation((0, 0, -0.024)))
        pis = mk.new_obj('PistonProto', bm, [M['piston'], M['ring'], M['pin'], M['crown']], parent=None, uv_scale=8)
        mk.bevel(pis, 0.0012, 2, 50)
        mk.apply_mods(pis)
        cb = bmesh.new()
        mk.add_cyl(cb, rr - 0.0055, CH - 0.011 + 0.03, seg=48, mat=Matrix.Translation((0, 0, -0.03)), mat_index=0)
        for sy in (-1, 1):
            mk.add_box(cb, (0.07, 0.03, 0.03), center=(0, sy * (rr - 0.004 + 0.015), -0.018), mat_index=0)
        for sx in (-1, 1):
            mk.add_cyl(cb, 0.02, 0.01, seg=40, mat=Matrix.Translation((sx * 0.021, 0, CH - 0.0012)), mat_index=3)
        cut = mk.new_obj('PisCut', cb, [M['piston'], M['ring'], M['pin'], M['crown']], uv_scale=8)
        # groove cutter must only remove a thin ring: build as difference of two cyl -> use intersection trick
        mk.boolean(pis, cut)
        mk.remove(cut)
        # rings (inside grooves), wrist pin, bosses
        bm = bmesh.new()
        for zz in (CH - 0.0055, CH - 0.0095, CH - 0.0135):
            mk.add_cyl(bm, rr + 0.00015, 0.0013, seg=64, mat=Matrix.Translation((0, 0, zz + 0.00005)), mat_index=1)
        mk.add_cyl(bm, 0.011, 0.066, seg=32, mat=Matrix.Translation((0, -0.033, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=2)
        for sy in (-1, 1):
            mk.add_cyl(bm, 0.016, 0.012, seg=32, mat=Matrix.Translation((0, sy * 0.017 - 0.006, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=0)
        extra = mk.new_obj('PisExtra', bm, [M['piston'], M['ring'], M['pin'], M['crown']], uv_scale=8)
        # crown top face -> crown material
        pis = mk.join([pis, extra], 'PistonMesh')
        me = pis.data
        for p in me.polygons:
            if p.normal.z > 0.95 and p.center.z > CH - 0.003:
                p.material_index = 3
        proto = pis.data
        self.piston_mesh = proto
        self.parts['pistons'] = {}
        for c in CYLS:
            o = bpy.data.objects.new(f'Piston_{c}', proto)
            mk.link(o)
            o.parent = self.root
            o.rotation_euler = (0, math.radians(beta(c)), 0)
            self.parts['pistons'][c] = o
        bpy.data.objects.remove(pis, do_unlink=True)

    # ------------------------------------------------------------------
    def rods(self):
        M = self.M
        bm = bmesh.new()
        w = 0.0205
        # big end ring
        mk.add_cyl(bm, 0.035, w, seg=48, mat=Matrix.Translation((0, -w / 2, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        # small end
        mk.add_cyl(bm, 0.0135, w * 0.9, seg=40, mat=Matrix.Translation((0, -w * 0.45, L)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'))
        # beam (trapezoid prism)
        mk.add_prism(bm, [(-0.014, 0.02), (0.014, 0.02), (0.008, L - 0.008), (-0.008, L - 0.008)], -0.008, 0.008)
        # cap bolts
        for sx in (-1, 1):
            mk.add_cyl(bm, 0.0045, 0.045, seg=16, mat=Matrix.Translation((sx * 0.0305, 0, -0.03)))
            mk.add_cyl(bm, 0.0062, 0.006, seg=6, mat=Matrix.Translation((sx * 0.0305, 0, -0.034)))
        rod = mk.new_obj('RodProto', bm, [M['rod'], M['bearing']], uv_scale=8)
        mk.bevel(rod, 0.0012, 2, 50)
        mk.apply_mods(rod)
        cb = bmesh.new()
        mk.add_cyl(cb, 0.0276, 0.1, seg=48, mat=Matrix.Translation((0, -0.05, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        mk.add_cyl(cb, 0.0111, 0.1, seg=32, mat=Matrix.Translation((0, -0.05, L)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        for sy in (-1, 1):
            mk.add_prism(cb, [(-0.009, 0.045), (0.009, 0.045), (0.005, L - 0.03), (-0.005, L - 0.03)], sy * 0.0035, sy * 0.02, mat_index=0)
        cut = mk.new_obj('RodCut', cb, [M['rod'], M['bearing']], uv_scale=8)
        mk.boolean(rod, cut)
        mk.remove(cut)
        # bearing shell
        bm = bmesh.new()
        mk.add_cyl(bm, 0.0277, w * 0.96, seg=48, mat=Matrix.Translation((0, -w * 0.48, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        sh = mk.new_obj('RodShell', bm, [M['rod'], M['bearing']], uv_scale=8)
        cb = bmesh.new()
        mk.add_cyl(cb, 0.0274, 0.1, seg=48, mat=Matrix.Translation((0, -0.05, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'X'), mat_index=1)
        cut = mk.new_obj('ShCut', cb, [M['rod'], M['bearing']], uv_scale=8)
        mk.boolean(sh, cut)
        mk.remove(cut)
        rod = mk.join([rod, sh], 'RodMesh')
        proto = rod.data
        self.parts['rods'] = {}
        for c in CYLS:
            o = bpy.data.objects.new(f'Rod_{c}', proto)
            mk.link(o)
            o.parent = self.root
            self.parts['rods'][c] = o
        bpy.data.objects.remove(rod, do_unlink=True)

    # ------------------------------------------------------------------
    def crank(self):
        M = self.M
        bm = bmesh.new()
        X = Matrix.Rotation(-math.pi / 2, 4, 'X')   # local Z -> +Y
        for y in MAIN_Y:
            mk.add_cyl(bm, 0.0325, 0.026, seg=48, mat=Matrix.Translation((0, y - 0.013, 0)) @ X, mat_index=1)
        for i, py in enumerate(PIN_Y):
            ph = math.radians([45.0, 135.0, 315.0, 225.0][i])
            px, pz = R * math.sin(ph), R * math.cos(ph)
            mk.add_cyl(bm, 0.0275, 0.048, seg=48, mat=Matrix.Translation((px, py - 0.024, pz)) @ X, mat_index=1)
            # two webs with counterweights
            web = mk.circle_pts(px, pz, 0.034, 40) + mk.circle_pts(0, 0, 0.04, 40)
            web += mk.circle_pts(0, 0, 0.074, 30, ph + math.pi - math.radians(58), ph + math.pi + math.radians(58))
            hull = mk.hull2d(web)
            for y0, y1 in ((py - 0.037, py - 0.024), (py + 0.024, py + 0.037)):
                mk.add_prism(bm, hull, y0, y1, mat_index=0)
        # rear flange, flexplate with ring gear
        mk.add_cyl(bm, 0.045, 0.012, seg=48, mat=Matrix.Translation((0, 0.213, 0)) @ X, mat_index=0)
        mk.add_cyl(bm, 0.145, 0.006, seg=96, mat=Matrix.Translation((0, 0.232, 0)) @ X, mat_index=2)
        add_gear(bm, 120, 0.15, 0.006, 0.231, 0.239, mat_index=2)
        cr = self.obj('Crankshaft', bm, [M['crank'], M['journal'], M['sprocket']], static=False, uv=8)
        mk.bevel(cr, 0.0012, 2, 45)
        self.parts['crank'] = cr
        # nose: snout + timing sprockets (hidden in section mode)
        bm = bmesh.new()
        mk.add_cyl(bm, 0.022, 0.11, seg=40, mat=Matrix.Translation((0, -0.322, 0)) @ X, mat_index=1)
        for s in (1, -1):
            yc = CHAIN_Y[s]
            add_gear(bm, N_CRANK_SPR, R_CRANK_SPR, 0.006, yc - 0.004, yc + 0.004, mat_index=2)
        nose = self.obj('CrankNose', bm, [M['crank_f'], M['journal_f'], M['sprocket_f']], static=False, uv=8)
        nose['isfront'] = 1.0
        self.parts['crank_nose'] = nose
        # damper pulley from BlenderKit asset (V pulley Big)
        self.parts['damper'] = self.bk_pulley('Damper', self.acc['damper'], 0.088)
        self.parts['wp_pulley'] = self.bk_pulley('WaterPumpPulley', self.acc['wp'], 0.058)
        self.parts['alt_pulley'] = self.bk_pulley('AltPulley', self.acc['alt'], 0.032)
        self.parts['idler'] = self.bk_pulley('Idler', self.acc['idler'], 0.036)
        self.parts['tens'] = self.bk_pulley('Tensioner', self.acc['tens'], 0.03)

    def bk_pulley(self, name, pos, r):
        src = self.M['_pulley_src']
        o = src.copy()
        o.data = src.data
        o.name = name
        mk.link(o)
        o.parent = self.root
        # source: radius 0.115 about local Z, depth 0.04 along Z (z from 0 to 0.04)
        k = r / 0.115
        o.scale = (k, k, 0.62)
        o.rotation_euler = (math.radians(90), 0, 0)
        o.location = (pos[0], PULLEY_Y - 0.0, pos[1])
        o['isfront'] = 1.0
        self.front_only.append(o)
        return o

    # ------------------------------------------------------------------
    def cams(self):
        M = self.M
        self.parts['cams'] = {}
        X = Matrix.Rotation(-math.pi / 2, 4, 'X')
        for s in (1, -1):
            c0 = 1 if s > 0 else 2
            cyls = [c for c in CYLS if side(c) == s]
            ci, ce = Vector(cam_centre(c0, 'in')), Vector(cam_centre(c0, 'ex'))
            dvec = ce - ci
            delta = math.atan2(dvec.x, dvec.z)
            # exhaust cam turns opposite (gear driven): rot_ex = -rot_in + K
            K = 2 * delta + math.pi + math.pi / GEAR_N
            self.parts.setdefault('cam_K', {})[s] = K
            for kind in ('in', 'ex'):
                cc = Vector(cam_centre(c0, kind))
                bm = bmesh.new()
                y_front = CHAIN_Y[s] - 0.006 if kind == 'in' else GEAR_Y[s] - 0.006
                y_back = HEAD_Y[1] - STAG * s - 0.004
                mk.add_cyl(bm, 0.0125, y_back - y_front, seg=32, mat=Matrix.Translation((0, y_front, 0)) @ X, mat_index=0)
                for yy in (-0.2, -0.1, 0.0, 0.1, 0.2):
                    mk.add_cyl(bm, 0.0133, 0.016, seg=32, mat=Matrix.Translation((0, yy - STAG * s - 0.008, 0)) @ X, mat_index=1)
                for c in cyls:
                    lam = cam_lobe_angle(c, kind)
                    if kind == 'ex':
                        # nose(world) = lam' - theta/2 + K ; need = eta+pi at peak
                        a = Vector(valve_axis(c, kind))
                        eta = math.atan2(a.x, a.z)
                        lam = eta + math.pi + math.radians((EX_PEAK + OFF[c]) / 2.0) - K
                    nx, nz = CAM_NOSE_D * math.sin(lam), CAM_NOSE_D * math.cos(lam)
                    pts = mk.circle_pts(0, 0, CAM_BASE, 64) + mk.circle_pts(nx, nz, CAM_NOSE_R, 48)
                    mk.add_prism(bm, mk.hull2d(pts), cyl_y(c) - 0.0085, cyl_y(c) + 0.0085, mat_index=1)
                o = self.obj(f'Cam_{kind}_{s:+d}', bm, [M['camshaft'], M['journal'], M['sprocket']], static=False, uv=8)
                mk.bevel(o, 0.0008, 1, 45, harden=False)
                o.location = (cc.x, 0, cc.z)
                self.parts['cams'][(s, kind)] = o
                bm = bmesh.new()
                if kind == 'in':
                    add_gear(bm, N_CAM_SPR, R_CAM_SPR, 0.006, CHAIN_Y[s] - 0.004, CHAIN_Y[s] + 0.004, mat_index=2)
                    mk.add_cyl(bm, 0.02, 0.012, seg=32, mat=Matrix.Translation((0, CHAIN_Y[s] - 0.006, 0)) @ X, mat_index=1)
                add_gear(bm, GEAR_N, GEAR_R, 0.0045, GEAR_Y[s] - 0.0045, GEAR_Y[s] + 0.0045, mat_index=2)
                g = self.obj(f'CamDrive_{kind}_{s:+d}', bm, [M['crank_f'], M['journal_f'], M['sprocket_f']], static=False, uv=8)
                g.location = (cc.x, 0, cc.z)
                g['isfront'] = 1.0
                self.parts.setdefault('cam_drive', {})[(s, kind)] = g

    # ------------------------------------------------------------------
    def valves(self):
        M = self.M
        self.parts['valves'] = {}
        self.parts['springs'] = {}
        protos = {}
        for kind, hr in (('in', IN_HEAD_R), ('ex', EX_HEAD_R)):
            bm = bmesh.new()
            mk.add_cyl(bm, hr, 0.0018, seg=48, mat_index=1)
            mk.add_cyl(bm, hr - 0.0005, 0.007, seg=48, r2=0.0045, mat=Matrix.Translation((0, 0, 0.0018)), mat_index=1)
            mk.add_cyl(bm, 0.0035, STEM_LEN - 0.006, seg=16, mat=Matrix.Translation((0, 0, 0.006)), mat_index=0)
            mk.add_cyl(bm, 0.0105, 0.004, seg=32, r2=0.0085, mat=Matrix.Translation((0, 0, STEM_LEN - 0.006)), mat_index=0)
            mk.add_cyl(bm, 0.0165, BUCKET_H, seg=40, mat=Matrix.Translation((0, 0, STEM_LEN)), mat_index=2)
            o = mk.new_obj(f'Valve_{kind}_proto', bm, [M['stem'], M['valvehead'], M['bucket']], uv_scale=10)
            mk.bevel(o, 0.0006, 1, 45, harden=False)
            mk.apply_mods(o)
            protos[kind] = o.data
            bpy.data.objects.remove(o, do_unlink=True)
        # spring (helix) length 0.040 from seat distance 0.060
        pts = []
        turns, n = 6.5, 260
        for i in range(n + 1):
            t = i / n
            a = 2 * math.pi * turns * t
            z = 0.040 * t
            pts.append(Vector((0.0118 * math.cos(a), 0.0118 * math.sin(a), z)))
        bm = bmesh.new()
        mk.sweep_tube(bm, pts, 0.0017, seg=10)
        o = mk.new_obj('SpringProto', bm, [M['spring']], uv_scale=10)
        spring_me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        for c in CYLS:
            for kind in ('in', 'ex'):
                a = Vector(valve_axis(c, kind))
                seat = Vector(valve_seat(c, kind))
                v = bpy.data.objects.new(f'Valve_{kind}_{c}', protos[kind])
                mk.link(v)
                v.parent = self.root
                v.location = seat
                v.rotation_euler = (0, math.atan2(a.x, a.z), 0)
                self.parts['valves'][(c, kind)] = v
                sp = bpy.data.objects.new(f'Spring_{kind}_{c}', spring_me)
                mk.link(sp)
                sp.parent = self.root
                sp.location = seat + a * 0.060
                sp.rotation_euler = (0, math.atan2(a.x, a.z), 0)
                self.parts['springs'][(c, kind)] = sp

    # ------------------------------------------------------------------
    def spark_plugs(self, plug_objs):
        """plug_objs: list of objects of the BlenderKit spark plug (hierarchy root first)."""
        self.parts['plugs'] = {}
        self.parts['plug_tips'] = {}
        root_src = plug_objs
        for c in CYLS:
            U = Vector(bank_U(c))
            tip = Vector((0, cyl_y(c) + PLUG_DY, 0)) + U * (DECK + ROOF_H - 0.0045)
            inst = bpy.data.objects.new(f'Plug_{c}', None)
            inst.instance_type = 'COLLECTION'
            inst.instance_collection = root_src
            mk.link(inst)
            inst.parent = self.root
            # source collection: plug axis = +Z, electrode tip at origin, length scaled to ~0.085 m
            inst.location = tip
            inst.rotation_euler = (0, math.radians(beta(c)), 0)
            self.parts['plugs'][c] = inst
            self.parts['plug_tips'][c] = tip

    # ------------------------------------------------------------------
    def gas(self, gas_mat):
        """Volumes inside each cylinder: bore part (scaled) + static dome; half versions for cyl 1/2."""
        self.parts['gas'] = {}
        bm = bmesh.new()
        mk.add_cyl(bm, RB - 0.0009, 1.0, seg=48, mat=Matrix.Translation((0, 0, -1.0)))
        bm.normal_update()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > -1e-4 and f.normal.z > 0.5], context='FACES_ONLY')
        bore_full = bm
        ch = chamber_bm(RB - 0.0009, roof_off=0.0009, depth_below=0.0)
        bmesh.ops.translate(ch, verts=ch.verts, vec=(0, 0, -DECK))
        meshes = {}
        for nm, b in (('bore', bore_full), ('dome', ch)):
            me = bpy.data.meshes.new('gas_' + nm)
            b.to_mesh(me)
            b.free()
            me.materials.append(gas_mat)
            meshes[nm] = me

        def half(me_src, cut_local_y):
            b = bmesh.new()
            b.from_mesh(me_src)
            res = bmesh.ops.bisect_plane(b, geom=b.verts[:] + b.edges[:] + b.faces[:], plane_co=(0, cut_local_y, 0), plane_no=(0, -1, 0), clear_outer=True)
            bmesh.ops.holes_fill(b, edges=[e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)], sides=0)
            recalc(b)
            me = bpy.data.meshes.new(me_src.name + '_half')
            b.to_mesh(me)
            b.free()
            me.materials.append(gas_mat)
            return me
        for c in CYLS:
            U = Vector(bank_U(c))
            deck_pt = Vector((0, cyl_y(c), 0)) + U * DECK
            entry = {}
            variants = [('full', meshes['bore'], meshes['dome'])]
            if c in (1, 2):
                cut_y = Y_CUT - cyl_y(c)
                variants.append(('half', half(meshes['bore'], cut_y), half(meshes['dome'], cut_y)))
            for vname, mb, md in variants:
                ob = bpy.data.objects.new(f'GasBore_{c}_{vname}', mb)
                od = bpy.data.objects.new(f'GasDome_{c}_{vname}', md)
                for o in (ob, od):
                    mk.link(o)
                    o.parent = self.root
                    o.location = deck_pt
                    o.rotation_euler = (0, math.radians(beta(c)), 0)
                entry[vname] = (ob, od)
            self.parts['gas'][c] = entry

    # ------------------------------------------------------------------
    def split_static(self):
        """Split every static ghostable part at Y_CUT into front/back pieces."""
        out = []
        for o in list(self.static):
            if o.name not in bpy.data.objects:
                continue
            mk.apply_mods(o)
            ys = [v.co.y for v in o.data.vertices]
            if not ys:
                continue
            if o in self.front_only or max(ys) < Y_CUT:
                o['isfront'] = 1.0
                out.append(o)
                continue
            if min(ys) > Y_CUT:
                o['isfront'] = 0.0
                out.append(o)
                continue
            fr = o.copy()
            fr.data = o.data.copy()
            fr.name = o.name + '_F'
            mk.link(fr)
            # cutter box for y < Y_CUT
            bm = bmesh.new()
            mk.add_box(bm, (3, 2, 3), center=(0, Y_CUT - 1.0, 0), mat_index=len(o.data.materials) - 1)
            cutter = mk.new_obj('SplitCut', bm, list(o.data.materials), uv_scale=6)
            cutter.parent = self.root
            mk.boolean(o, cutter, 'DIFFERENCE')
            mk.boolean(fr, cutter, 'INTERSECT')
            mk.remove(cutter)
            o['isfront'] = 0.0
            fr['isfront'] = 1.0
            out += [o, fr]
        self.static = out
        return out
