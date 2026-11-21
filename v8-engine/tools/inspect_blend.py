import bpy, sys
p = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=p)
print('==', p)
for o in bpy.data.objects:
    d = o.dimensions
    print(f'OBJ {o.name:40s} {o.type:8s} parent={o.parent.name if o.parent else "-":20s} dims=({d.x:.2f},{d.y:.2f},{d.z:.2f}) loc=({o.location.x:.2f},{o.location.y:.2f},{o.location.z:.2f}) mats={[s.material.name if s.material else None for s in o.material_slots][:6]} polys={len(o.data.polygons) if o.type=="MESH" else 0} mods={[m.type for m in o.modifiers]}')
for m in bpy.data.materials:
    print('MAT', m.name, m.users)
for i in bpy.data.images:
    print('IMG', i.name, i.filepath, 'packed' if i.packed_file else '', i.size[:])
