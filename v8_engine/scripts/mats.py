"""Materiais: BlenderKit (PBR) + shaders técnicos (gases, raio-x, dissolução, fluxo)."""
import bpy
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BK = os.path.join(ROOT, 'cache', 'bk')
_cache = {}


def bk_material(asset, newname):
    """anexa o material de um .blend do BlenderKit"""
    path = os.path.join(BK, 'mat', asset + '.blend')
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.materials = list(src.materials)
    m = [x for x in dst.materials if x][0]
    for x in dst.materials[1:]:
        if x:
            bpy.data.materials.remove(x)
    m.name = newname
    # deslocamento (bump por altura) é caro e invisível nesta escala: desconecta
    for n in m.node_tree.nodes:
        if n.type == 'OUTPUT_MATERIAL':
            for l in list(n.inputs['Displacement'].links):
                m.node_tree.links.remove(l)
    return m


def node(nt, typ, loc=(0, 0), **kw):
    n = nt.nodes.new(typ)
    n.location = loc
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def principled(name, base=(0.8, 0.8, 0.8), metallic=0.0, rough=0.5, coat=0.0, aniso=0.0, emission=None, em_strength=0.0, alpha=1.0, spec_tint=None):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Anisotropic'].default_value = aniso
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = em_strength
    p.inputs['Alpha'].default_value = alpha
    return m


def add_noise_rough(m, scale=60.0, amount=0.15, bump=0.0, bump_scale=300.0):
    """variação de rugosidade/bump procedural (micro-detalhe de usinagem/fundição)"""
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    nz = node(nt, 'ShaderNodeTexNoise', (-700, 0))
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr = node(nt, 'ShaderNodeMapRange', (-500, 0))
    base = p.inputs['Roughness'].default_value
    mr.inputs['To Min'].default_value = max(0.0, base - amount)
    mr.inputs['To Max'].default_value = min(1.0, base + amount)
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], p.inputs['Roughness'])
    if bump > 0:
        nz2 = node(nt, 'ShaderNodeTexNoise', (-700, -300))
        nz2.inputs['Scale'].default_value = bump_scale
        nz2.inputs['Detail'].default_value = 3
        nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
        b = node(nt, 'ShaderNodeBump', (-300, -300))
        b.inputs['Strength'].default_value = bump
        b.inputs['Distance'].default_value = 0.0005
        nt.links.new(nz2.outputs['Fac'], b.inputs['Height'])
        nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def attr(nt, name, kind='OBJECT', loc=(0, 0)):
    a = node(nt, 'ShaderNodeAttribute', loc)
    a.attribute_type = kind
    a.attribute_name = name
    return a


def math_node(nt, op, a=None, b=None, loc=(0, 0), clamp=False):
    n = node(nt, 'ShaderNodeMath', loc)
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def surface_link(m):
    nt = m.node_tree
    out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL']
    out = [n for n in out if n.is_active_output] or out
    out = out[0]
    lk = out.inputs['Surface'].links
    return nt, out, (lk[0].from_socket if lk else None)


def wrap_xray(m):
    """mistura o material opaco com um 'acrílico fumê' conforme a máscara de raio-x (varredura em Y)"""
    nt, out, src = surface_link(m)
    if src is None:
        return m
    x0 = -1600
    geo = node(nt, 'ShaderNodeNewGeometry', (x0, -600))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (x0 + 200, -600))
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    pos = attr(nt, 'xray_pos', 'VIEW_LAYER', (x0 + 200, -800))
    # mascara = 1 - smoothstep(pos-w, pos+w, y)
    d = math_node(nt, 'SUBTRACT', sep.outputs['Y'], pos.outputs['Fac'], (x0 + 400, -700))
    w = math_node(nt, 'DIVIDE', d, 0.05, (x0 + 550, -700))
    mask = math_node(nt, 'SUBTRACT', 0.5, w, (x0 + 700, -700), clamp=True)
    amt = attr(nt, 'xray_amt', 'VIEW_LAYER', (x0 + 700, -900))
    maskf = math_node(nt, 'MULTIPLY', mask, amt.outputs['Fac'], (x0 + 850, -800))
    # linha de varredura
    dd = math_node(nt, 'DIVIDE', d, 0.006, (x0 + 550, -1000))
    dd2 = math_node(nt, 'MULTIPLY', dd, dd, (x0 + 700, -1000))
    g = math_node(nt, 'MULTIPLY', dd2, -1.0, (x0 + 850, -1000))
    g = math_node(nt, 'EXPONENT', g, None, (x0 + 1000, -1000))
    edge = attr(nt, 'xray_edge', 'VIEW_LAYER', (x0 + 1000, -1150))
    g = math_node(nt, 'MULTIPLY', g, edge.outputs['Fac'], (x0 + 1150, -1000))
    # acrílico fumê
    lw = node(nt, 'ShaderNodeLayerWeight', (x0 + 600, -300))
    lw.inputs['Blend'].default_value = 0.3
    fac = math_node(nt, 'POWER', lw.outputs['Facing'], 3.0, (x0 + 800, -300))
    fac = math_node(nt, 'MULTIPLY_ADD', fac, 0.5, (x0 + 950, -300))
    nt.nodes[-1].inputs[2].default_value = 0.045
    tr = node(nt, 'ShaderNodeBsdfTransparent', (x0 + 950, -150))
    gl = node(nt, 'ShaderNodeBsdfPrincipled', (x0 + 950, -450))
    gl.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1)
    gl.inputs['Roughness'].default_value = 0.3
    gl.inputs['Metallic'].default_value = 0.0
    gl.inputs['Emission Color'].default_value = (0.45, 0.7, 1.0, 1)
    gl.inputs['Emission Strength'].default_value = 0.0
    mx = node(nt, 'ShaderNodeMixShader', (x0 + 1200, -250))
    nt.links.new(fac, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(gl.outputs[0], mx.inputs[2])
    # raios de sombra atravessam o acrílico (mais barato e mais legível)
    lp = node(nt, 'ShaderNodeLightPath', (x0 + 950, 150))
    shf = math_node(nt, 'MAXIMUM', fac, lp.outputs['Is Shadow Ray'], (x0 + 1100, 100))
    shf_inv = math_node(nt, 'SUBTRACT', fac, lp.outputs['Is Shadow Ray'], (x0 + 1100, 0), clamp=True)
    nt.links.new(shf_inv, mx.inputs[0])
    # mistura final
    mf = node(nt, 'ShaderNodeMixShader', (out.location.x - 400, out.location.y))
    nt.links.new(maskf, mf.inputs[0])
    nt.links.new(src, mf.inputs[1])
    nt.links.new(mx.outputs[0], mf.inputs[2])
    em = node(nt, 'ShaderNodeEmission', (out.location.x - 400, out.location.y - 250))
    em.inputs['Color'].default_value = (0.55, 0.8, 1.0, 1)
    nt.links.new(math_node(nt, 'MULTIPLY', g, 25.0, (x0 + 1300, -1000)), em.inputs['Strength'])
    ad = node(nt, 'ShaderNodeAddShader', (out.location.x - 200, out.location.y))
    nt.links.new(mf.outputs[0], ad.inputs[0])
    nt.links.new(em.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs['Surface'])
    return m


def wrap_fade(m, wipe_prop='car_wipe', obj_prop='hide'):
    """dissolve da carroceria: varredura frente->trás + propriedade por objeto"""
    nt, out, src = surface_link(m)
    if src is None:
        return m
    x0 = out.location.x - 900
    geo = node(nt, 'ShaderNodeNewGeometry', (x0, -500))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (x0 + 150, -500))
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    pos = attr(nt, wipe_prop, 'VIEW_LAYER', (x0 + 150, -700))
    d = math_node(nt, 'SUBTRACT', pos.outputs['Fac'], sep.outputs['Y'], (x0 + 300, -600))
    w = math_node(nt, 'DIVIDE', d, 0.5, (x0 + 450, -600))
    sceneh = math_node(nt, 'ADD', w, 0.5, (x0 + 600, -600), clamp=True)
    oh = attr(nt, obj_prop, 'OBJECT', (x0 + 600, -800))
    h = math_node(nt, 'ADD', sceneh, oh.outputs['Fac'], (x0 + 750, -700), clamp=True)
    tr = node(nt, 'ShaderNodeBsdfTransparent', (x0 + 750, -300))
    mf = node(nt, 'ShaderNodeMixShader', (out.location.x - 200, out.location.y))
    nt.links.new(h, mf.inputs[0])
    nt.links.new(src, mf.inputs[1])
    nt.links.new(tr.outputs[0], mf.inputs[2])
    nt.links.new(mf.outputs[0], out.inputs['Surface'])
    return m


def gas_material():
    """gases na câmara: mistura (azul), frente de chama, gases quentes (laranja) e fumaça"""
    m = bpy.data.materials.new('M_gas')
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (1400, 0))
    A = {k: attr(nt, k, 'OBJECT', (-1200, -i * 160)) for i, k in enumerate(['gas_fresh', 'gas_hot', 'gas_burned', 'gas_bright', 'flame_r', 'flame_front', 'gas_vis'])}
    plug = attr(nt, 'plug_pos', 'OBJECT', (-1200, 300))
    geo = node(nt, 'ShaderNodeNewGeometry', (-1200, 500))
    vd = node(nt, 'ShaderNodeVectorMath', (-1000, 400))
    vd.operation = 'DISTANCE'
    nt.links.new(geo.outputs['Position'], vd.inputs[0])
    nt.links.new(plug.outputs['Vector'], vd.inputs[1])
    dist = vd.outputs['Value']
    fr = A['flame_r'].outputs['Fac']
    # inside = 1 - smoothstep(fr-0.003, fr+0.003, d)
    t = math_node(nt, 'SUBTRACT', dist, fr, (-800, 400))
    t = math_node(nt, 'DIVIDE', t, 0.006, (-650, 400))
    inside = math_node(nt, 'SUBTRACT', 0.5, t, (-500, 400), clamp=True)
    # frente de chama: exp(-(d-fr)^2/0.0035^2)
    q = math_node(nt, 'DIVIDE', math_node(nt, 'SUBTRACT', dist, fr, (-800, 650)), 0.0045, (-650, 650))
    q = math_node(nt, 'MULTIPLY', q, q, (-500, 650))
    q = math_node(nt, 'MULTIPLY', q, -1.0, (-350, 650))
    q = math_node(nt, 'EXPONENT', q, None, (-200, 650))
    front = math_node(nt, 'MULTIPLY', q, A['flame_front'].outputs['Fac'], (-50, 650))
    notin = math_node(nt, 'SUBTRACT', 1.0, inside, (-350, 400))
    fresh = math_node(nt, 'MULTIPLY', A['gas_fresh'].outputs['Fac'], notin, (-200, 300))
    hot = math_node(nt, 'MULTIPLY', A['gas_hot'].outputs['Fac'], inside, (-200, 150))
    burned = math_node(nt, 'MULTIPLY', A['gas_burned'].outputs['Fac'], inside, (-200, 0))
    # cor dos gases quentes
    ramp = node(nt, 'ShaderNodeValToRGB', (0, 150))
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0.35, 0.06, 0.01, 1)
    cr.elements[1].position = 1.0
    cr.elements[1].color = (1.0, 0.52, 0.12, 1)
    e = cr.elements.new(0.55)
    e.color = (1.0, 0.33, 0.04, 1)
    nt.links.new(A['gas_hot'].outputs['Fac'], ramp.inputs[0])
    # emissões
    em_mix = node(nt, 'ShaderNodeEmission', (400, 400))
    em_mix.inputs['Color'].default_value = (0.08, 0.32, 1.0, 1)
    s1 = math_node(nt, 'MULTIPLY', fresh, A['gas_bright'].outputs['Fac'], (200, 450))
    s1b = math_node(nt, 'MULTIPLY_ADD', A['gas_bright'].outputs['Fac'], 0.16, (150, 520))
    nt.nodes[-1].inputs[2].default_value = 0.34
    nt.links.new(math_node(nt, 'MULTIPLY', fresh, s1b, (300, 450)), em_mix.inputs['Strength'])
    em_hot = node(nt, 'ShaderNodeEmission', (400, 150))
    nt.links.new(ramp.outputs['Color'], em_hot.inputs['Color'])
    nt.links.new(math_node(nt, 'MULTIPLY', hot, 1.5, (300, 200)), em_hot.inputs['Strength'])
    em_fr = node(nt, 'ShaderNodeEmission', (400, 650))
    em_fr.inputs['Color'].default_value = (1.0, 0.7, 0.3, 1)
    nt.links.new(math_node(nt, 'MULTIPLY', front, 3.5, (300, 700)), em_fr.inputs['Strength'])
    smoke = node(nt, 'ShaderNodeBsdfDiffuse', (400, -100))
    smoke.inputs['Color'].default_value = (0.28, 0.25, 0.23, 1)
    tr = node(nt, 'ShaderNodeBsdfTransparent', (400, -300))
    add1 = node(nt, 'ShaderNodeAddShader', (650, 400))
    nt.links.new(em_mix.outputs[0], add1.inputs[0])
    nt.links.new(em_hot.outputs[0], add1.inputs[1])
    add2 = node(nt, 'ShaderNodeAddShader', (800, 450))
    nt.links.new(add1.outputs[0], add2.inputs[0])
    nt.links.new(em_fr.outputs[0], add2.inputs[1])
    # opacidade
    smoke_amt = math_node(nt, 'MULTIPLY', burned, math_node(nt, 'SUBTRACT', 1.0, A['gas_hot'].outputs['Fac'], (200, -200), clamp=True), (350, -200))
    alpha = math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', fresh, 0.22, (500, -400)), math_node(nt, 'MULTIPLY', smoke_amt, 0.5, (500, -500)), (650, -450))
    alpha = math_node(nt, 'ADD', alpha, math_node(nt, 'MULTIPLY', hot, 0.25, (650, -600)), (800, -500), clamp=True)
    mix_s = node(nt, 'ShaderNodeMixShader', (950, -200))
    nt.links.new(alpha, mix_s.inputs[0])
    nt.links.new(tr.outputs[0], mix_s.inputs[1])
    nt.links.new(smoke.outputs[0], mix_s.inputs[2])
    add3 = node(nt, 'ShaderNodeAddShader', (1100, 100))
    nt.links.new(mix_s.outputs[0], add3.inputs[0])
    nt.links.new(add2.outputs[0], add3.inputs[1])
    # visibilidade global
    vis = node(nt, 'ShaderNodeMixShader', (1250, 0))
    nt.links.new(A['gas_vis'].outputs['Fac'], vis.inputs[0])
    tr2 = node(nt, 'ShaderNodeBsdfTransparent', (1100, -150))
    nt.links.new(tr2.outputs[0], vis.inputs[1])
    nt.links.new(add3.outputs[0], vis.inputs[2])
    nt.links.new(vis.outputs[0], out.inputs['Surface'])
    return m


def flow_material(name, color, strength=6.0, dashes=14.0):
    """faixas de fluxo animadas: u ao longo do tubo, deslocamento por propriedade 'flow_off'"""
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (900, 0))
    uv = node(nt, 'ShaderNodeUVMap', (-900, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-700, 0))
    nt.links.new(uv.outputs[0], sep.inputs[0])
    off = attr(nt, 'flow_off', 'OBJECT', (-700, -200))
    amt = attr(nt, 'flow_amt', 'OBJECT', (-700, -350))
    lenp = attr(nt, 'flow_len', 'OBJECT', (-700, -500))
    # posição em metros ao longo do tubo
    u_m = math_node(nt, 'MULTIPLY', sep.outputs['X'], lenp.outputs['Fac'], (-500, 0))
    x = math_node(nt, 'SUBTRACT', math_node(nt, 'MULTIPLY', u_m, dashes / 0.1, (-350, 0)), off.outputs['Fac'], (-200, 0))
    fr = math_node(nt, 'FRACT', x, None, (-50, 0))
    # traço com cauda: 1 - fract, potência
    tail = math_node(nt, 'POWER', fr, 3.0, (100, 0))
    # esmaece nas pontas do tubo
    e0 = math_node(nt, 'MULTIPLY', sep.outputs['X'], 8.0, (-200, 250), clamp=True)
    e1 = math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', 1.0, sep.outputs['X'], (-350, 400)), 6.0, (-200, 400), clamp=True)
    ends = math_node(nt, 'MULTIPLY', e0, e1, (-50, 300))
    k = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', tail, ends, (250, 100)), amt.outputs['Fac'], (400, 100))
    em = node(nt, 'ShaderNodeEmission', (550, 150))
    em.inputs['Color'].default_value = (*color, 1)
    nt.links.new(math_node(nt, 'MULTIPLY', k, strength, (500, 250)), em.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent', (550, -100))
    mx = node(nt, 'ShaderNodeMixShader', (750, 0))
    nt.links.new(math_node(nt, 'MULTIPLY', k, 1.0, (600, -200), clamp=True), mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return m


def emissive(name, color, prop='spark', gain=60.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (600, 0))
    a = attr(nt, prop, 'OBJECT', (-400, -100))
    em = node(nt, 'ShaderNodeEmission', (100, 100))
    em.inputs['Color'].default_value = (*color, 1)
    nt.links.new(math_node(nt, 'MULTIPLY', a.outputs['Fac'], gain, (-100, -100)), em.inputs['Strength'])
    tr = node(nt, 'ShaderNodeBsdfTransparent', (100, -150))
    mx = node(nt, 'ShaderNodeMixShader', (350, 0))
    nt.links.new(math_node(nt, 'MULTIPLY', a.outputs['Fac'], 3.0, (-100, -300), clamp=True), mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return m


def belt_material(name='M_belt', teeth_per_m=105.0):
    m = principled(name, base=(0.025, 0.025, 0.028), rough=0.55)
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    uv = node(nt, 'ShaderNodeUVMap', (-900, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-700, 0))
    nt.links.new(uv.outputs[0], sep.inputs[0])
    lenp = attr(nt, 'flow_len', 'OBJECT', (-700, -200))
    off = attr(nt, 'belt_off', 'OBJECT', (-700, -350))
    u_m = math_node(nt, 'MULTIPLY', sep.outputs['X'], lenp.outputs['Fac'], (-500, 0))
    x = math_node(nt, 'SUBTRACT', math_node(nt, 'MULTIPLY', u_m, teeth_per_m, (-350, 0)), off.outputs['Fac'], (-200, 0))
    fr = math_node(nt, 'FRACT', x, None, (-50, 0))
    sq = math_node(nt, 'GREATER_THAN', fr, 0.5, (100, 0))
    b = node(nt, 'ShaderNodeBump', (300, -200))
    b.inputs['Strength'].default_value = 0.8
    b.inputs['Distance'].default_value = 0.002
    nt.links.new(sq, b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


TEX_TYPES = {'TEX_NOISE', 'TEX_WAVE', 'TEX_VORONOI', 'TEX_GRADIENT', 'TEX_MAGIC', 'TEX_BRICK', 'TEX_CHECKER', 'TEX_WHITE_NOISE', 'TEX_GABOR'}


def rescale_coords(nt, k, seen=None):
    """multiplica as coordenadas de textura procedurais (materiais feitos para objetos de ~1 m)"""
    seen = seen if seen is not None else set()
    if nt.name in seen:
        return
    seen.add(nt.name)
    for l in list(nt.links):
        if l.from_node.type == 'TEX_COORD' and l.from_socket.name in ('Generated', 'Object', 'UV'):
            vm = nt.nodes.new('ShaderNodeVectorMath')
            vm.operation = 'SCALE'
            vm.inputs['Scale'].default_value = k
            src, dst = l.from_socket, l.to_socket
            nt.links.remove(l)
            nt.links.new(src, vm.inputs[0])
            nt.links.new(vm.outputs[0], dst)
    tc = None
    for n in list(nt.nodes):
        if n.type in TEX_TYPES and 'Vector' in n.inputs and not n.inputs['Vector'].is_linked:
            if tc is None:
                tc = nt.nodes.new('ShaderNodeTexCoord')
                vm = nt.nodes.new('ShaderNodeVectorMath')
                vm.operation = 'SCALE'
                vm.inputs['Scale'].default_value = k
                nt.links.new(tc.outputs['Object'], vm.inputs[0])
            nt.links.new(vm.outputs[0], n.inputs['Vector'])
        if n.type == 'GROUP' and n.node_tree:
            rescale_coords(n.node_tree, k, seen)


def wrap_hide(m, prop):
    """torna o material transparente conforme uma propriedade da cena (0 visível, 1 oculto)"""
    nt, out, src = surface_link(m)
    if src is None:
        return m
    a = attr(nt, prop, 'VIEW_LAYER', (out.location.x - 500, out.location.y - 300))
    tr = node(nt, 'ShaderNodeBsdfTransparent', (out.location.x - 400, out.location.y - 150))
    mf = node(nt, 'ShaderNodeMixShader', (out.location.x - 200, out.location.y))
    nt.links.new(a.outputs['Fac'], mf.inputs[0])
    nt.links.new(src, mf.inputs[1])
    nt.links.new(tr.outputs[0], mf.inputs[2])
    nt.links.new(mf.outputs[0], out.inputs['Surface'])
    return m


def tint(m, rgb):
    """multiplica a cor base do Principled (ligada ou não) por rgb"""
    nt = m.node_tree
    for p in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
        inp = p.inputs['Base Color']
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['B'].default_value = (*rgb, 1)
        if inp.is_linked:
            src = inp.links[0].from_socket
            nt.links.new(src, mix.inputs['A'])
        else:
            mix.inputs['A'].default_value = inp.default_value
        nt.links.new(mix.outputs['Result'], inp)
    return m
