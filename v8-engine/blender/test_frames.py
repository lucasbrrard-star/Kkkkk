import bpy, sys, time, os
args = sys.argv[sys.argv.index('--') + 1:]
frames = [int(x) for x in args[0].split(',')]
w, h = int(args[1]), int(args[2])
spp = int(args[3]) if len(args) > 3 else 16
outdir = args[4] if len(args) > 4 else os.path.join(os.path.dirname(__file__), '..', 'render', 'test')
os.makedirs(outdir, exist_ok=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.cycles.samples = spp
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(outdir, f'f{f:04d}.png')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'RENDERED {f} {time.time() - t:.1f}s', flush=True)
