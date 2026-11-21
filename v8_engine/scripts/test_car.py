import bpy, sys, math, time
argv = sys.argv[sys.argv.index('--')+1:]
engine = argv[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load('cache/bk/blend/fdb71593.blend') as (src, dst):
    dst.objects = src.objects
for o in dst.objects:
    if o: bpy.context.scene.collection.objects.link(o)
for o in bpy.context.scene.objects:
    if o.type=='MESH': print(o.name, [ (m.type, getattr(m,'levels',None), getattr(m,'render_levels',None)) for m in o.modifiers], o.parent.name if o.parent else None)
sc = bpy.context.scene
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (4.5, -5.0, 2.2); 
import mathutils
d = mathutils.Vector((0,0,0.5)) - cam.location
cam.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun','SUN')); sun.data.energy=3; sun.rotation_euler=(0.6,0.2,0.5); sc.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.3,0.3,0.32,1)
sc.render.engine = engine
sc.render.resolution_x=640; sc.render.resolution_y=360
if engine=='CYCLES': sc.cycles.samples=16; sc.cycles.device='CPU'
sc.render.filepath = f'/tmp/claude-0/-home-user-Kkkkk/bed9ffb9-a3fc-5c52-97af-8f4ad69594f9/scratchpad/car_{engine}.png'
t=time.time(); bpy.ops.render.render(write_still=True); print('RENDER TIME', engine, time.time()-t)
