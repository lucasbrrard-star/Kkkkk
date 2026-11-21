# Monta o SKYWALKER a partir de modelos gratuitos do BlenderKit e exporta um GLB animado.
#
#   corpo   : "Skeletal Humanoid Creature" (rig Auto-Rig Pro)
#   cabeça  : crânio + galhadas do "Deer antler trophy"
#   clipes  : "Tree Monster Rigged Animated" (mesmo padrão de rig ARP) + "X Bot" (Mixamo, exemplos do three.js)
#
# O rig ARP depende de restrições que o glTF não carrega, então o script cria um esqueleto
# limpo (só ossos que deformam, hierarquia simples), soma os pesos dos ossos "stretch/twist"
# e transfere as animações por rotação global com correção de pose de repouso (A-pose × T-pose).
#
# Uso: blender -b -P tools/blender/build_skywalker.py -- <cache> <saida.glb> [preview_dir]
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
CACHE, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None
S = 1.32            # escala do corpo (≈2,6 m sem as galhadas)
HEAD_S = 1.05       # escala do crânio/galhadas

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.fps = 30


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# ------------------------------------------------------------------ corpo
body_objs = imp(os.path.join(CACHE, "creature_body.glb"))
src_rig = next(o for o in body_objs if o.type == 'ARMATURE')
body = next(o for o in body_objs if o.type == 'MESH' and o.name.startswith('undead body'))
for o in body_objs:
    if o.type == 'MESH' and o is not body:
        bpy.data.objects.remove(o)

RW = src_rig.matrix_world.copy()
def bhead(n): return (RW @ src_rig.data.bones[n].head_local) * S
def btail(n): return (RW @ src_rig.data.bones[n].tail_local) * S

# malha em coordenadas de mundo, escalada
mw = body.matrix_world.copy()
body.parent = None
body.matrix_world = Matrix.Scale(S, 4) @ mw
bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for m in list(body.modifiers): body.modifiers.remove(m)

# ------------------------------------------------------------------ esqueleto limpo
# nome novo: (cabeça, cauda, pai, grupos de peso de origem)
SIDES = [('L', 'l'), ('R', 'r')]
BONES = {}
def add(name, head, tail, parent, groups):
    BONES[name] = dict(head=head, tail=tail, parent=parent, groups=groups)

add('hips', bhead('root.x'), bhead('root.x') + Vector((0, 0, 0.12 * S)), None, ['root.x'])
add('spine_01', bhead('spine_01.x'), bhead('spine_02.x'), 'hips', ['spine_01.x'])
add('spine_02', bhead('spine_02.x'), bhead('spine_03.x'), 'spine_01', ['spine_02.x'])
add('spine_03', bhead('spine_03.x'), bhead('neck.x'), 'spine_02', ['spine_03.x'])
add('neck', bhead('neck.x'), bhead('head.x'), 'spine_03', ['neck.x'])
add('head', bhead('head.x'), bhead('head.x') + Vector((0, 0, 0.18 * S)), 'neck', ['head.x'])
for U, s in SIDES:
    add(f'shoulder.{U}', bhead(f'shoulder.{s}'), bhead(f'arm.{s}'), 'spine_03', [f'shoulder.{s}'])
    add(f'upperarm.{U}', bhead(f'arm.{s}'), bhead(f'forearm.{s}'), f'shoulder.{U}', [f'c_arm_twist_offset.{s}', f'arm_stretch.{s}'])
    add(f'forearm.{U}', bhead(f'forearm.{s}'), bhead(f'hand.{s}'), f'upperarm.{U}', [f'forearm_stretch.{s}', f'forearm_twist.{s}'])
    add(f'hand.{U}', bhead(f'hand.{s}'), bhead(f'c_middle1_base.{s}'), f'forearm.{U}', [f'hand.{s}'])
    add(f'thumb1.{U}', bhead(f'thumb1.{s}'), bhead(f'c_thumb2.{s}'), f'hand.{U}', [f'thumb1.{s}'])
    add(f'thumb2.{U}', bhead(f'c_thumb2.{s}'), bhead(f'c_thumb3.{s}'), f'thumb1.{U}', [f'c_thumb2.{s}'])
    add(f'thumb3.{U}', bhead(f'c_thumb3.{s}'), btail(f'c_thumb3.{s}'), f'thumb2.{U}', [f'c_thumb3.{s}'])
    for f in ('index', 'middle', 'ring', 'pinky'):
        add(f'{f}0.{U}', bhead(f'c_{f}1_base.{s}'), bhead(f'{f}1.{s}'), f'hand.{U}', [f'c_{f}1_base.{s}'])
        add(f'{f}1.{U}', bhead(f'{f}1.{s}'), bhead(f'c_{f}2.{s}'), f'{f}0.{U}', [f'{f}1.{s}'])
        add(f'{f}2.{U}', bhead(f'c_{f}2.{s}'), bhead(f'c_{f}3.{s}'), f'{f}1.{U}', [f'c_{f}2.{s}'])
        add(f'{f}3.{U}', bhead(f'c_{f}3.{s}'), btail(f'c_{f}3.{s}'), f'{f}2.{U}', [f'c_{f}3.{s}'])
    add(f'thigh.{U}', bhead(f'thigh.{s}'), bhead(f'leg.{s}'), 'hips', [f'thigh_twist.{s}', f'thigh_stretch.{s}'])
    add(f'shin.{U}', bhead(f'leg.{s}'), bhead(f'foot.{s}'), f'thigh.{U}', [f'leg_stretch.{s}', f'leg_twist.{s}'])
    add(f'foot.{U}', bhead(f'foot.{s}'), bhead(f'toes_01.{s}'), f'shin.{U}', [f'foot.{s}'])
    add(f'toe.{U}', bhead(f'toes_01.{s}'), btail(f'toes_01.{s}'), f'foot.{U}', [f'toes_01.{s}'])

arm_data = bpy.data.armatures.new('SkywalkerRig')
rig = bpy.data.objects.new('Skywalker', arm_data)
scn.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects: o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for name, b in BONES.items():
    e = arm_data.edit_bones.new(name)
    e.head, e.tail = b['head'], b['tail']
    if (e.tail - e.head).length < 1e-3: e.tail = e.head + Vector((0, 0, 0.02))
    e.roll = 0
    eb[name] = e
for name, b in BONES.items():
    if b['parent']: eb[name].parent = eb[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ pesos: soma dos grupos de origem
old = {g.index: g.name for g in body.vertex_groups}
new_w = {n: {} for n in BONES}
src_to_new = {}
for n, b in BONES.items():
    for g in b['groups']: src_to_new[g] = n
for v in body.data.vertices:
    for g in v.groups:
        n = src_to_new.get(old[g.group])
        if n and g.weight > 0: new_w[n][v.index] = new_w[n].get(v.index, 0) + g.weight
for g in list(body.vertex_groups): body.vertex_groups.remove(g)
for n, ws in new_w.items():
    vg = body.vertex_groups.new(name=n)
    for vi, w in ws.items(): vg.add([vi], min(1.0, w), 'REPLACE')

# ------------------------------------------------------------------ cabeça: remove a original
bm = bmesh.new(); bm.from_mesh(body.data)
deform = bm.verts.layers.deform.active
hg = body.vertex_groups['head'].index
kill = [v for v in bm.verts if v[deform].get(hg, 0) > 0.45]
bmesh.ops.delete(bm, geom=kill, context='VERTS')
# borda do pescoço (arestas de contorno perto do topo) → onde a nuca do crânio encaixa
nz = BONES['neck']['head'].z
rim = {v for e in bm.edges if e.is_boundary for v in e.verts if v.co.z > nz - 0.05 and abs(v.co.x) < 0.2}
RIM = sum((v.co for v in rim), Vector()) / max(1, len(rim))
print('borda do pescoço', len(rim), tuple(round(x, 3) for x in RIM), 'osso head', tuple(round(x, 3) for x in BONES['head']['head']), flush=True)
bm.to_mesh(body.data); bm.free()
print('cabeça removida:', len(kill), 'vértices', flush=True)

# ------------------------------------------------------------------ crânio + galhadas
tro = imp(os.path.join(CACHE, "antler_trophy.glb"))
antl = next(o for o in tro if o.name == 'HP')
skull = next(o for o in tro if o.name == 'Plane')
for o in tro:
    if o.type == 'MESH' and o not in (antl, skull): bpy.data.objects.remove(o)

# material das galhadas: albedo "color" do próprio modelo
am = bpy.data.materials.new('antler'); am.use_nodes = True
bsdf = am.node_tree.nodes['Principled BSDF']
tex = am.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images['color']
am.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.72
antl.data.materials.clear(); antl.data.materials.append(am)
sm = bpy.data.materials.new('skull'); sm.use_nodes = True
sb = sm.node_tree.nodes['Principled BSDF']
st = sm.node_tree.nodes.new('ShaderNodeTexImage'); st.image = bpy.data.images['03']
sm.node_tree.links.new(st.outputs['Color'], sb.inputs['Base Color'])
sb.inputs['Roughness'].default_value = 0.8
skull.data.materials.clear(); skull.data.materials.append(sm)

# no troféu: focinho → -Y, testa → +Z, galhadas sobem em +Y; ponto da nuca ≈ (0, 0.12, 0.03)
nape = Vector((0, 0.085, 0.05))
R = Matrix.Rotation(math.radians(38), 4, 'X')        # inclina o focinho para baixo, galhadas sobem
head_pos = RIM + Vector((0, 0.01, 0.025))
M = Matrix.Translation(head_pos) @ R @ Matrix.Scale(HEAD_S, 4) @ Matrix.Translation(-nape)
for o in (antl, skull):
    o.parent = None
    o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vg = o.vertex_groups.new(name='head'); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')

# junta tudo em uma malha só
for x in bpy.context.selected_objects: x.select_set(False)
for o in (body, antl, skull): o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'SkywalkerBody'
body.parent = rig
mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
# normaliza pesos (máx. 4 influências)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# marcador dos olhos (órbitas do crânio) para o brilho no jogo
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
e = arm_data.edit_bones.new('eyes')
eye = M @ Vector((0, -0.075, 0.075))
e.head, e.tail = eye, eye + Vector((0, -0.05, 0)); e.parent = arm_data.edit_bones['head']
bpy.ops.object.mode_set(mode='OBJECT')
bpy.data.objects.remove(src_rig)
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)

# ------------------------------------------------------------------ transferência de animações
REST = {b.name: (rig.matrix_world @ b.matrix_local) for b in rig.data.bones}
REST_Q = {n: m.to_quaternion() for n, m in REST.items()}
ORDER = [b.name for b in rig.data.bones]   # bones já vêm em ordem pai → filho
DIRCHILD = {}
for n, b in BONES.items():
    if b['parent'] and b['parent'] not in DIRCHILD: DIRCHILD[b['parent']] = n
DIRCHILD.update({'spine_03': 'neck', 'hand.L': 'middle0.L', 'hand.R': 'middle0.R', 'hips': None})

ARP = {'hips': 'root.x', 'spine_01': 'spine_01.x', 'spine_02': 'spine_02.x', 'spine_03': 'spine_03.x', 'neck': 'neck.x', 'head': 'head.x'}
MIX = {'hips': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck': 'Neck', 'head': 'Head'}
for U, s in SIDES:
    side = 'Left' if U == 'L' else 'Right'
    ARP.update({f'shoulder.{U}': f'shoulder.{s}', f'upperarm.{U}': f'arm_stretch.{s}', f'forearm.{U}': f'forearm_stretch.{s}',
                f'hand.{U}': f'hand.{s}', f'thigh.{U}': f'thigh_stretch.{s}', f'shin.{U}': f'leg_stretch.{s}',
                f'foot.{U}': f'foot.{s}', f'toe.{U}': f'toes_01.{s}',
                f'thumb1.{U}': f'thumb1.{s}', f'thumb2.{U}': f'c_thumb2.{s}', f'thumb3.{U}': f'c_thumb3.{s}'})
    MIX.update({f'shoulder.{U}': f'{side}Shoulder', f'upperarm.{U}': f'{side}Arm', f'forearm.{U}': f'{side}ForeArm',
                f'hand.{U}': f'{side}Hand', f'thigh.{U}': f'{side}UpLeg', f'shin.{U}': f'{side}Leg',
                f'foot.{U}': f'{side}Foot', f'toe.{U}': f'{side}ToeBase',
                f'thumb1.{U}': f'{side}HandThumb1', f'thumb2.{U}': f'{side}HandThumb2', f'thumb3.{U}': f'{side}HandThumb3'})
    for f in ('index', 'middle', 'ring', 'pinky'):
        F = f.capitalize()
        ARP.update({f'{f}1.{U}': f'{f}1.{s}', f'{f}2.{U}': f'c_{f}2.{s}', f'{f}3.{U}': f'c_{f}3.{s}'})
        MIX.update({f'{f}1.{U}': f'{side}Hand{F}1', f'{f}2.{U}': f'{side}Hand{F}2', f'{f}3.{U}': f'{side}Hand{F}3'})


def rot_between(a, b):
    a = a.normalized(); b = b.normalized()
    return a.rotation_difference(b)


def retarget(src_file, mapping, prefix, clips):
    acts_before = set(bpy.data.actions)
    objs = imp(src_file)
    src_acts = {a.name: a for a in bpy.data.actions if a not in acts_before}
    sarm = next(o for o in objs if o.type == 'ARMATURE')
    sb = {canon: sarm.data.bones.get(prefix + canon) for canon in set(mapping.values())}
    sw = sarm.matrix_world
    srest = {k: (sw @ b.matrix_local) for k, b in sb.items() if b}
    # correção de repouso: alinha a direção do osso alvo à direção do osso fonte
    C = {}
    for n in ORDER:
        src = mapping.get(n)
        ch = DIRCHILD.get(n)
        if not src or src not in srest or not ch or ch not in mapping or mapping[ch] not in srest:
            C[n] = Quaternion(); continue
        dt = REST[ch].translation - REST[n].translation
        ds = srest[mapping[ch]].translation - srest[src].translation
        C[n] = rot_between(dt, ds)
    hip_src = mapping['hips']
    k = REST['hips'].translation.z / max(1e-4, srest[hip_src].translation.z)
    made = []
    for clip_name, out_name, in_place in clips:
        act = src_acts.get(clip_name) or next((a for n, a in src_acts.items() if n.split('.')[0] == clip_name), None)
        if not act: print('clipe ausente', clip_name, list(src_acts)); continue
        for t in sarm.animation_data.nla_tracks: t.mute = True
        sarm.animation_data.action = act
        if act.slots and sarm.animation_data.action_slot != act.slots[0]:
            sarm.animation_data.action_slot = act.slots[0]
        f0, f1 = int(math.floor(act.frame_range[0])), int(math.ceil(act.frame_range[1]))
        new = bpy.data.actions.new('SW_' + out_name)
        if not rig.animation_data: rig.animation_data_create()
        rig.animation_data.action = new
        for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'
        for f in range(f0, f1 + 1):
            scn.frame_set(f)
            W = {}
            for n in ORDER:
                b = rig.data.bones[n]
                src = mapping.get(n)
                par = b.parent.name if b.parent else None
                if src and src in srest:
                    spb = sarm.pose.bones[prefix + src]
                    Rs = (sw @ spb.matrix).to_quaternion()
                    Rs0 = srest[src].to_quaternion()
                    W[n] = Rs @ Rs0.inverted() @ C[n] @ REST_Q[n]
                elif par:
                    W[n] = W[par] @ REST_Q[par].inverted() @ REST_Q[n]
                else:
                    W[n] = REST_Q[n].copy()
                if par:
                    basis = REST_Q[n].inverted() @ REST_Q[par] @ W[par].inverted() @ W[n]
                else:
                    basis = REST_Q[n].inverted() @ W[n]
                pb = rig.pose.bones[n]
                pb.rotation_quaternion = basis.normalized()
                pb.keyframe_insert('rotation_quaternion', frame=f - f0)
            # translação do quadril
            sp = (sw @ sarm.pose.bones[prefix + hip_src].matrix).translation
            d = (sp - srest[hip_src].translation) * k
            if in_place: d.x = 0; d.y = 0
            pb = rig.pose.bones['hips']
            pb.location = REST_Q['hips'].inverted() @ d
            pb.keyframe_insert('location', frame=f - f0)
        tr = rig.animation_data.nla_tracks.new(); tr.name = out_name
        tr.strips.new('SW_' + out_name, 0, new)
        rig.animation_data.action = None
        made.append((out_name, f1 - f0))
    for o in objs:
        if o.type == 'ARMATURE' or o.type == 'MESH' or o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.users == 0 and a.name not in [m[0] for m in made]: pass
    print('clipes', made, flush=True)
    return made


XBOT = os.path.join(CACHE, 'anim', 'Xbot.glb')
retarget(os.path.join(CACHE, 'anim', 'treemonster.glb'), ARP, '', [
    ('Idle(1_120)', 'idle', True), ('Walk(1_24)', 'walk', True), ('AttackL(1_20)', 'attack_l', True),
    ('AttackR(1_20)', 'attack_r', True), ('Hit(1_14)', 'hit', True), ('Die(1_23)', 'die', True)])
retarget(XBOT, MIX, 'mixamorig:', [('run', 'run', True), ('walk', 'stalk', True)])

# remove ações das fontes
for a in list(bpy.data.actions):
    if not a.name.startswith('SW_'): bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o not in (rig, body): bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------ prévia (opcional)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.color_type = 'TEXTURE'
    scn.render.resolution_x = 420; scn.render.resolution_y = 560
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam); scn.camera = cam
    shots = [('rest', 0), ('idle', 30), ('walk', 6), ('run', 4), ('attack_l', 9), ('attack_r', 11), ('hit', 5), ('stalk', 6), ('die', 25)]
    for clip, fr in shots:
        for t in rig.animation_data.nla_tracks: t.mute = True
        rig.animation_data.action = bpy.data.actions.get('SW_' + clip)
        if rig.animation_data.action and rig.animation_data.action.slots:
            rig.animation_data.action_slot = rig.animation_data.action.slots[0]
        if clip == 'rest':
            for pb in rig.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
        scn.frame_set(fr)
        views = [('front', Vector((1.2, -4.6, 2.0)), Vector((0, 0, 1.55))), ('side', Vector((4.6, 0.2, 2.0)), Vector((0, 0, 1.55)))]
        if clip == 'rest': views.append(('head', Vector((1.6, -0.3, 2.45)), Vector((0, 0, 2.45))))
        for nm, loc, tgt in views:
            cam.location = loc
            cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
            scn.render.filepath = os.path.join(PREVIEW, f'sky_{clip}_{nm}.png')
            bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None
    for t in rig.animation_data.nla_tracks: t.mute = False

# ------------------------------------------------------------------ exporta
for x in bpy.context.selected_objects: x.select_set(False)
rig.select_set(True); body.select_set(True)
scn.frame_set(0)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True, export_apply=False,
                          export_image_format='AUTO', export_yup=True)
print('exportado', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)
