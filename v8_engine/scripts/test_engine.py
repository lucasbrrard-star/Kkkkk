import bpy, sys, os, math, time
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector
t0=time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
import build_engine as BE, rig, kin as K
sc = bpy.context.scene
col = bpy.data.collections.new('ENGINE'); sc.collection.children.link(col)
root = bpy.data.objects.new('ENGINE_ROOT', None); col.objects.link(root)
E = BE.Engine(root, col).build()
print('BUILD TIME', time.time()-t0)
for o in E.static:
    print('static', o.name, len(o.data.polygons))
theta = float(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 30.0
rig.pose(E, theta)
w = bpy.data.worlds.new('w'); sc.world = w
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(BE.MT.BK,'hdr','65fe1eca.exr'))
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0])
w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sc['xray_pos'] = 2.0; sc['xray_amt'] = float(os.environ.get('XRAY','0')); sc['xray_edge']=0.0; sc['cut_glow']=0.0
for c in range(1,9):
    st = K.gas_state(theta, c)
    for o in E.gas[c]:
        for k,v in [('gas_fresh',st['fresh']),('gas_hot',st['hot']),('gas_burned',st['burned']),('gas_bright',st['bright']),('flame_r',st['flame_r']),('flame_front',st['flame_front'])]:
            o[k]=v
        o['plug_pos'] = list(root.matrix_world @ E.plug_tips[c])
    E.gas[c][0].scale = (1,1,max(1e-4, st['gap']))
# corte opcional
if os.environ.get('CUT'):
    import geo as G
    cut = G.new_obj('CUTTER', G.box((-2,-2,-2),(2,0,2)), col, root)
    cut.location.y = K.cyl_info(1)[2]
    cut.hide_render = True
    cm = bpy.data.materials['M_cutface']; cut.data.materials.append(cm)
    for o in E.static:
        m = o.modifiers.new('section','BOOLEAN'); m.object = cut; m.solver='EXACT'; m.material_mode='TRANSFER'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
sc.render.engine='CYCLES'; sc.cycles.samples=int(os.environ.get('SPP','16')); sc.cycles.use_denoising=True
sc.render.resolution_x=540; sc.render.resolution_y=960
sc.view_settings.view_transform='AgX'
views = {'front34': ((0.9,-1.4,0.9),(0,0,0.12),35), 'top': ((0.15,-0.9,1.6),(0,0,0.15),35), 'sec': ((-0.17,-0.75,0.17),(-0.15,K.cyl_info(1)[2],0.15),50)}
which = os.environ.get('VIEWS','front34,top').split(',')
for name in which:
    loc, tgt, f = views[name]
    cam.location = loc; cam.data.lens = f
    d = Vector(tgt) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
    if name=='sec':
        cam.rotation_euler.rotate_axis('Z', math.radians(float(os.environ.get('ROLL','45'))))
    sc.render.filepath = f'/tmp/claude-0/-home-user-Kkkkk/bed9ffb9-a3fc-5c52-97af-8f4ad69594f9/scratchpad/eng_{name}.png'
    t1=time.time(); bpy.ops.render.render(write_still=True); print('RENDER', name, time.time()-t1)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/claude-0/-home-user-Kkkkk/bed9ffb9-a3fc-5c52-97af-8f4ad69594f9/scratchpad/engine_test.blend')
