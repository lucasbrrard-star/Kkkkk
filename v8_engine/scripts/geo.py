"""Ferramentas de geometria procedural (bmesh) para o V8."""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix


def new_obj(name, me, col=None, parent=None):
    o = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(o)
    if parent:
        o.parent = parent
    return o


def bm_to_mesh(bm, name, smooth_angle=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if smooth_angle is not None:
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    return me


def lathe(profile, segments=64, name='lathe', smooth_angle=35, cap=True):
    """profile: lista (r, z) de baixo para cima; revolve em torno de Z."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        if r < 1e-7:
            ring = [bm.verts.new((0, 0, z))]
        else:
            for i in range(segments):
                a = 2 * math.pi * i / segments
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segments):
            i2 = (i + 1) % segments
            if len(A) == 1:
                bm.faces.new((A[0], B[i], B[i2]))
            elif len(B) == 1:
                bm.faces.new((A[i], B[0], A[i2]))
            else:
                bm.faces.new((A[i], A[i2], B[i2], B[i]))
    if cap:
        if len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_to_mesh(bm, name, smooth_angle)


def prism_xz(poly, y0, y1, name='prism', smooth_angle=None):
    """polígono no plano XZ (lista de (x,z)) extrudado em Y de y0 a y1"""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for (x, z) in poly]
    b = [bm.verts.new((x, y1, z)) for (x, z) in poly]
    n = len(poly)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        i2 = (i + 1) % n
        bm.faces.new((a[i], a[i2], b[i2], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_to_mesh(bm, name, smooth_angle)


def prism_xy(poly, z0, z1, name='prism'):
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    b = [bm.verts.new((x, y, z1)) for (x, y) in poly]
    n = len(poly)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        i2 = (i + 1) % n
        bm.faces.new((a[i], a[i2], b[i2], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_to_mesh(bm, name)


def box(mn, mx, name='box'):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector([mn[i] + (v.co[i] + 0.5) * (mx[i] - mn[i]) for i in range(3)])
    return bm_to_mesh(bm, name)


def rounded_rect(cx, cz, w, h, r, seg=6):
    """retângulo arredondado no plano (x,z)"""
    pts = []
    corners = [(cx + w / 2 - r, cz + h / 2 - r, 0), (cx - w / 2 + r, cz + h / 2 - r, 90),
               (cx - w / 2 + r, cz - h / 2 + r, 180), (cx + w / 2 - r, cz - h / 2 + r, 270)]
    for (x, z, a0) in corners:
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((x + r * math.cos(a), z + r * math.sin(a)))
    return pts


def circle_pts(cx, cz, r, n=48, a0=0.0, a1=360.0):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + (0 if a1 - a0 >= 360 else 1))]


def convex_hull(pts):
    pts = sorted(set((round(p[0], 7), round(p[1], 7)) for p in pts))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def cylinder(r, z0, z1, segments=48, name='cyl'):
    return lathe([(0, z0), (r, z0), (r, z1), (0, z1)], segments, name, smooth_angle=30)


def tube_ring(r_in, r_out, z0, z1, segments=64, name='ring'):
    bm = bmesh.new()
    rings = []
    for (r, z) in [(r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1)]:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)])
    for k in range(4):
        A, B = rings[k], rings[(k + 1) % 4]
        for i in range(segments):
            i2 = (i + 1) % segments
            bm.faces.new((A[i], A[i2], B[i2], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_to_mesh(bm, name, 40)


def catmull(points, samples_per_seg=12):
    P = [Vector(p) for p in points]
    if len(P) < 3:
        return [P[0].lerp(P[-1], i / (samples_per_seg)) for i in range(samples_per_seg + 1)]
    out = []
    ext = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(samples_per_seg):
            t = k / samples_per_seg
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def sweep(path, radius, segments=24, name='tube', caps=True, closed=False, radius_fn=None, uv=True, profile=None):
    """varre um círculo (ou perfil 2D) ao longo de path (lista de Vector); UV: u = comprimento normalizado"""
    path = [Vector(p) for p in path]
    n = len(path)
    tangents = []
    for i in range(n):
        if closed:
            t = path[(i + 1) % n] - path[i - 1]
        elif i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        tangents.append(t.normalized())
    # transporte paralelo
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            ax = tangents[i - 1].cross(tangents[i])
            if ax.length > 1e-9:
                ang = math.asin(min(1.0, ax.length))
                if tangents[i - 1].dot(tangents[i]) < 0:
                    ang = math.pi - ang
                normal = Matrix.Rotation(ang, 3, ax.normalized()) @ normal
            normal = (normal - tangents[i] * normal.dot(tangents[i])).normalized()
        frames.append((normal.copy(), tangents[i].cross(normal).normalized()))
    lens = [0.0]
    for i in range(1, n):
        lens.append(lens[-1] + (path[i] - path[i - 1]).length)
    total = lens[-1] + ((path[0] - path[-1]).length if closed else 0)
    if profile is None:
        profile = [(math.cos(2 * math.pi * k / segments), math.sin(2 * math.pi * k / segments)) for k in range(segments)]
    m = len(profile)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap') if uv else None
    rings = []
    for i in range(n):
        r = radius_fn(i / (n - 1)) if radius_fn else radius
        N, B = frames[i]
        rings.append([bm.verts.new(path[i] + N * (px * r) + B * (py * r)) for (px, py) in profile])
    segs = n if closed else n - 1
    for i in range(segs):
        A, Bv = rings[i], rings[(i + 1) % n]
        u0 = lens[i] / total
        u1 = (lens[i + 1] / total) if i + 1 < n else 1.0
        for k in range(m):
            k2 = (k + 1) % m
            f = bm.faces.new((A[k], A[k2], Bv[k2], Bv[k]))
            if uv:
                for loop, (uu, vv) in zip(f.loops, [(u0, k / m), (u0, (k + 1) / m), (u1, (k + 1) / m), (u1, k / m)]):
                    loop[uvl].uv = (uu, vv)
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bm_to_mesh(bm, name, 50)
    me['length'] = total
    return me


def apply_bool(target, cutter_me, op='DIFFERENCE', solver='EXACT', keep=False):
    """aplica booleana usando uma malha temporária"""
    tmp = bpy.data.objects.new('_cut', cutter_me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp.matrix_world = target.matrix_world.copy()
    m = target.modifiers.new('b', 'BOOLEAN')
    m.object = tmp
    m.operation = op
    m.solver = solver
    dg = bpy.context.evaluated_depsgraph_get()
    ev = target.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    me.materials.clear()
    target.modifiers.remove(m)
    old = target.data
    target.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(tmp)
    if not keep:
        bpy.data.meshes.remove(cutter_me)
    return target


def join_meshes(mes, name):
    bm = bmesh.new()
    for me in mes:
        bm.from_mesh(me)
    for me in mes:
        bpy.data.meshes.remove(me)
    return bm_to_mesh(bm, name)


def transform_mesh(me, M):
    me.transform(M)
    if M.to_3x3().determinant() < 0:
        me.flip_normals()
    return me


def box_uv(me, scale=6.0):
    """UV por projeção cúbica (eixo dominante da normal)"""
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers[0].data
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                uv = (co.y, co.z)
            elif ax == 1:
                uv = (co.x, co.z)
            else:
                uv = (co.x, co.y)
            uvl[li].uv = (uv[0] * scale, uv[1] * scale)


def smooth_mesh(me, angle=35):
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))


def add_bevel(o, width=0.0015, segments=2, angle=40):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return m


def helix(r_coil, wire_r, z0, z1, turns, name='spring', seg=10, steps_per_turn=24):
    pts = []
    N = int(turns * steps_per_turn)
    for i in range(N + 1):
        t = i / N
        a = 2 * math.pi * turns * t
        # espiras fechadas nas pontas
        zt = t
        pts.append((r_coil * math.cos(a), r_coil * math.sin(a), z0 + (z1 - z0) * zt))
    return sweep(pts, wire_r, seg, name, caps=True)
