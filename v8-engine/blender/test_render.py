import bpy, time, os, sys
sc = bpy.context.scene
args = sys.argv[sys.argv.index('--') + 1:]
w, h, spp = int(args[0]), int(args[1]), int(args[2])
frames = [int(x) for x in args[3].split(',')]
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.cycles.samples = spp
out = '/tmp/claude-0/-home-user-Kkkkk/e2f47492-517e-5e8e-ad2a-05ef0692f75f/scratchpad/prof'
os.makedirs(out, exist_ok=True)
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = f'{out}/p_{f:04d}.png'
    t = time.time(); bpy.ops.render.render(write_still=True); print(f'PROF {f} {time.time()-t:.1f}s', flush=True)
