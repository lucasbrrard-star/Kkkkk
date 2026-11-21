"""Render all frames (resumable). Usage: blender -b scene.blend -P render_all.py -- W H SPP"""
import bpy, sys, os
args = sys.argv[sys.argv.index('--') + 1:]
w, h, spp = int(args[0]), int(args[1]), int(args[2])
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.cycles.samples = spp
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'render', 'frames')
os.makedirs(out, exist_ok=True)
sc.render.filepath = os.path.join(out, 'f')
sc.render.use_file_extension = True
sc.render.use_overwrite = False
sc.render.use_placeholder = True
sc.frame_start, sc.frame_end = 1, 900
bpy.ops.render.render(animation=True)
print('ALL DONE')
