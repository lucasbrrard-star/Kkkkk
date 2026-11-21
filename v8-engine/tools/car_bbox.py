import bpy, sys
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index('--')+1])
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    oe = o.evaluated_get(dg)
    me = oe.to_mesh()
    vs = [oe.matrix_world @ v.co for v in me.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    print(f'BB {o.name:14s} x[{mn.x:6.2f},{mx.x:6.2f}] y[{mn.y:6.2f},{mx.y:6.2f}] z[{mn.z:6.2f},{mx.z:6.2f}] polys={len(me.polygons)} mat={o.active_material.name if o.active_material else None}')
    if o.name == 'maska':
        # hood underside height profile along y at x=0..0.3
        for y in [-2.2,-2.0,-1.8,-1.6,-1.4,-1.2,-1.0,-0.8,-0.6]:
            zs=[v.z for v in vs if abs(v.y-y)<0.05 and abs(v.x)<0.35]
            print('  hood y',y,'zmin',round(min(zs),3) if zs else None,'zmax',round(max(zs),3) if zs else None)
    oe.to_mesh_clear()
for m in bpy.data.materials:
    if m.name.startswith('Car paint'):
        print('PAINT nodes', [(n.type, n.name) for n in m.node_tree.nodes])
