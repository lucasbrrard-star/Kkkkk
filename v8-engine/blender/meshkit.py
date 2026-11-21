"""Small bmesh/bpy helpers for procedural hard-surface parts (Blender 5.x)."""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_obj(name, bm, mat=None, smooth_angle=35, coll=None, parent=None, uv_scale=4.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    if uv_scale:
        box_uv(bm, uv_scale)
    bm.to_mesh(me)
    bm.free()
    if smooth_angle is not None:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    ob = bpy.data.objects.new(name, me)
    if mat is not None:
        mats = mat if isinstance(mat, (list, tuple)) else [mat]
        for m in mats:
            me.materials.append(m)
    link(ob, coll)
    if parent is not None:
        ob.parent = parent
    return ob


def bm_new():
    return bmesh.new()


def add_cyl(bm, r, h, seg=48, mat=Matrix(), r2=None, cap=True, mat_index=0):
    """Cylinder/cone along local +Z from z=0 to z=h, transformed by mat."""
    geom = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg,
                                 radius1=r, radius2=r if r2 is None else r2, depth=h,
                                 matrix=mat @ Matrix.Translation((0, 0, h / 2)))
    for f in {f for v in geom['verts'] for f in v.link_faces}:
        f.material_index = mat_index
    return geom['verts']


def add_box(bm, size, center=(0, 0, 0), mat=Matrix(), mat_index=0):
    m = mat @ Matrix.Translation(center) @ Matrix.Diagonal((size[0], size[1], size[2], 1))
    geom = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for f in {f for v in geom['verts'] for f in v.link_faces}:
        f.material_index = mat_index
    return geom['verts']


def add_torus(bm, R, r, seg=48, rseg=12, mat=Matrix(), mat_index=0):
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new(mat @ Vector((x, y, z))))
        verts.append(ring)
    for i in range(seg):
        for j in range(rseg):
            a, b = verts[i][j], verts[(i + 1) % seg][j]
            c, d = verts[(i + 1) % seg][(j + 1) % rseg], verts[i][(j + 1) % rseg]
            f = bm.faces.new((a, b, c, d))
            f.material_index = mat_index
    return [v for ring in verts for v in ring]


def add_prism(bm, poly, y0, y1, mat=Matrix(), mat_index=0):
    """Extrude a 2D polygon given in (x, z) along Y from y0 to y1."""
    n = len(poly)
    # ensure CCW when looking from -Y toward +Y (x right, z up)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    if area < 0:
        poly = list(reversed(poly))
    a = [bm.verts.new(mat @ Vector((p[0], y0, p[1]))) for p in poly]
    b = [bm.verts.new(mat @ Vector((p[0], y1, p[1]))) for p in poly]
    fs = [bm.faces.new(list(reversed(a))) if False else bm.faces.new(a), bm.faces.new(list(reversed(b)))]
    for i in range(n):
        fs.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
    for f in fs:
        f.material_index = mat_index
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    return a + b


def sweep_tube(bm, pts, r, seg=24, closed_ends=True, radii=None, mat_index=0):
    """Sweep a circle along a polyline (list of Vector). Parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    tans = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i - 1])
        tans.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            ax = tans[i - 1].cross(tans[i])
            if ax.length > 1e-8:
                ang = tans[i - 1].angle(tans[i])
                nrm = (Matrix.Rotation(ang, 3, ax.normalized()) @ nrm)
        bn = tans[i].cross(nrm).normalized()
        rr = radii[i] if radii else r
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            ring.append(bm.verts.new(pts[i] + (nrm * math.cos(a) + bn * math.sin(a)) * rr))
        rings.append(ring)
    faces = []
    for i in range(n - 1):
        for j in range(seg):
            faces.append(bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j])))
    if closed_ends:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        faces.append(bm.faces.new(rings[-1]))
    for f in faces:
        f.material_index = mat_index
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return [v for ring in rings for v in ring]


def bezier_pts(p0, p1, p2, p3, n=24):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    out = []
    for i in range(n + 1):
        t = i / n
        out.append((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
    return out


def hull2d(points):
    pts = sorted(set((round(p[0], 7), round(p[1], 7)) for p in points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def circle_pts(cx, cz, r, n=48, a0=0.0, a1=2 * math.pi):
    return [(cx + r * math.sin(a0 + (a1 - a0) * i / n), cz + r * math.cos(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def box_uv(bm, scale=4.0):
    """Tri-planar style UVs: project each face on its dominant axis plane."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            if ax == 0:
                lp[uv].uv = (co.y * scale, co.z * scale)
            elif ax == 1:
                lp[uv].uv = (co.x * scale, co.z * scale)
            else:
                lp[uv].uv = (co.x * scale, co.y * scale)


def bevel(ob, width=0.0015, segments=2, angle=40, harden=True):
    m = ob.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    return m


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def boolean(ob, cutter, op='DIFFERENCE', apply=True, hide_cutter=True):
    m = ob.modifiers.new('Bool', 'BOOLEAN')
    m.operation = op
    m.solver = 'EXACT'
    m.use_self = True
    m.use_hole_tolerant = True
    m.object = cutter
    try:
        m.material_mode = 'TRANSFER'
    except Exception:
        pass
    if apply:
        apply_mods(ob)
    if hide_cutter:
        cutter.hide_render = True
        cutter.hide_viewport = True
    return ob


def remove(ob):
    me = ob.data if ob.type == 'MESH' else None
    bpy.data.objects.remove(ob, do_unlink=True)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)


def join(objs, name):
    """Join mesh objects (same parent frame assumed) into the first one."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        dg = bpy.context.evaluated_depsgraph_get()
        me = o.evaluated_get(dg).to_mesh()
        tmp = bmesh.new()
        tmp.from_mesh(me)
        idx_map = []
        for m in o.data.materials:
            if m not in mats:
                mats.append(m)
            idx_map.append(mats.index(m))
        for f in tmp.faces:
            if idx_map:
                f.material_index = idx_map[min(f.material_index, len(idx_map) - 1)]
        bmesh.ops.transform(tmp, matrix=o.matrix_basis, verts=tmp.verts)
        me2 = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me2)
        tmp.free()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
        o.evaluated_get(dg).to_mesh_clear()
    par = objs[0].parent
    for o in objs:
        remove(o)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        me.materials.append(m)
    link(ob)
    ob.parent = par
    return ob
