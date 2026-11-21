"""Static engine check renders: solid / section / ghost from a fixed camera."""
import bpy, os, math, sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
import camera as cm
sc = bpy.context.scene
out = '/tmp/claude-0/-home-user-Kkkkk/e2f47492-517e-5e8e-ad2a-05ef0692f75f/scratchpad/beauty'
os.makedirs(out, exist_ok=True)
args = sys.argv[sys.argv.index('--') + 1:]
w, h, spp = int(args[0]), int(args[1]), int(args[2])
sc.render.resolution_x, sc.render.resolution_y = w, h
sc.cycles.samples = spp
bpy.data.collections['CAR'].hide_render = True
ng = bpy.data.node_groups['CTL']
ng.animation_data_clear()
camob = sc.camera
camob.animation_data_clear(); camob.data.animation_data_clear()
camob.data.dof.use_dof = False
def setctl(**kw):
    for k, v in kw.items():
        ng.nodes[k].outputs[0].default_value = v
def shoot(tag, pos, tgt, lens, up=Vector((0, 0, 1)), f=330):
    sc.frame_set(f)
    camob.data.lens = lens
    camob.matrix_world = Matrix.Translation(pos) @ cm.look_matrix(pos, tgt, up).to_4x4()
    sc.render.filepath = f'{out}/{tag}.png'
    bpy.ops.render.render(write_still=True)
    print('SHOT', tag, flush=True)
E = cm.E
setctl(e_gpos=-0.6, e_front=1, e_sect=0, c_gpos=-3)
shoot('solid_34', E + Vector((-0.75, -0.95, 0.65)), E + Vector((0, 0, 0.12)), 30)
shoot('solid_side', E + Vector((1.2, 0.1, 0.25)), E + Vector((0, 0, 0.1)), 32)
setctl(e_gpos=-0.45, e_front=0, e_sect=1)
shoot('sect_front', E + Vector((0.05, -1.25, 0.2)), E + Vector((0, -0.16, 0.12)), 32)
p, t = cm.sect(0.24, 0.5)
shoot('sect_macro', p, t, 40, up=cm.U1, f=465)
setctl(e_gpos=0.66, e_front=1, e_sect=0)
shoot('ghost_34', E + Vector((-0.75, -0.95, 0.65)), E + Vector((0, 0, 0.12)), 30, f=720)
