"""render rápido de quadros para calibração: blender -b build/v8_scene.blend --python scripts/quick_render.py -- 300,462 270x480 8 [override]"""
import bpy, sys, os, time
a = sys.argv[sys.argv.index('--') + 1:]
frames = [int(x) for x in a[0].split(',')]
w, h = [int(x) for x in a[1].split('x')]
spp = int(a[2])
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.cycles.samples = spp
if len(a) > 3 and a[3] == 'override':
    m = bpy.data.materials.new('OVR'); sc.view_layers[0].material_override = m
out = os.path.join(os.path.dirname(bpy.data.filepath), 'quick')
os.makedirs(out, exist_ok=True)
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(out, f'q_{f:04d}.png')
    t = time.time(); bpy.ops.render.render(write_still=True); print('QTIME', f, round(time.time() - t, 2))
