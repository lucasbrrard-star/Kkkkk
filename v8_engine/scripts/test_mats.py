import bpy, glob, os, math, time
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
mats = []
for f in sorted(glob.glob('cache/bk/mat/*.blend')):
    with bpy.data.libraries.load(f, link=False) as (src, dst):
        dst.materials = src.materials
    for m in dst.materials:
        if m: mats.append((os.path.basename(f)[:8], m))
for i,(k,m) in enumerate(mats):
    nodes = m.node_tree.nodes
    tc = [ (n.type, [l.from_socket.name for inp in n.inputs for l in inp.links]) for n in nodes if n.type in ('TEX_COORD','UVMAP','MAPPING','TEX_IMAGE')]
    imgs = [(n.image.name, n.image.size[:], n.projection) for n in nodes if n.type=='TEX_IMAGE' and n.image]
    links_tc = set(l.from_socket.name for l in m.node_tree.links if l.from_node.type=='TEX_COORD')
    print(k, m.name, 'texcoord:', links_tc, 'imgs:', imgs)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=((i%5)*1.1-2.2, 0, -(i//5)*1.1+0.5), segments=64, ring_count=32)
    o = bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(m)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -6, 0); cam.rotation_euler = (math.pi/2, 0, 0)
w = bpy.data.worlds.new('w'); sc.world = w
nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.abspath('cache/bk/hdr/65fe1eca.exr'))
nt.links.new(env.outputs[0], nt.nodes['Background'].inputs[0])
sc.render.engine='CYCLES'; sc.cycles.samples=32; sc.render.resolution_x=800; sc.render.resolution_y=400
sc.render.filepath='/tmp/claude-0/-home-user-Kkkkk/bed9ffb9-a3fc-5c52-97af-8f4ad69594f9/scratchpad/mats.png'
bpy.ops.render.render(write_still=True)
