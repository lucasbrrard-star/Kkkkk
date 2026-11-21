import bpy, sys
argv = sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
p = argv[0]
if p.endswith('.blend'):
    with bpy.data.libraries.load(p) as (src, dst):
        dst.objects = src.objects
    for o in dst.objects:
        if o: bpy.context.scene.collection.objects.link(o)
else:
    bpy.ops.import_scene.gltf(filepath=p)
tot = 0
import mathutils
mn = mathutils.Vector((1e9,)*3); mx = -mn
for o in bpy.context.scene.objects:
    n = len(o.data.polygons) if o.type == 'MESH' else 0
    tot += n
    if o.type == 'MESH':
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    print(f'{o.name[:40]:40s} {o.type:6s} faces={n:7d} mats={[m.name for m in o.data.materials] if o.type=="MESH" else ""} loc={tuple(round(v,3) for v in o.matrix_world.translation)} dims={tuple(round(v,3) for v in o.dimensions)}')
print('TOTAL faces', tot, 'bbox', mn, mx)
