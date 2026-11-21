"""Materials: BlenderKit PBR imports, ghost/x-ray wrapper, gas volume, FX."""
import os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'cache')

BK = {
    'cast_al': '740f16c1',      # Cast Satin Aluminum
    'cast_al2': 'd44d4d73',     # Cast Aluminum
    'brushed_ss': 'b867817a',   # Brushed Stainless Steel
    'steel': '370bad42',        # Steel
    'black_anod': '5f58eac5',   # Black Anodized Aluminum
    'carbon': '315b8e70',       # Carbon Fiber Glossy
    'rubber': '5753435b',       # Rubber Black
    'cast_iron': '840ba424',    # Cast Iron
    'satin_chrome': '3f90bbae',  # Satin Chrome
}
USED_BK = set()


def load_bk(key):
    aid = BK[key]
    path = os.path.join(CACHE, 'bk', aid + '.blend')
    with bpy.data.libraries.load(path) as (df, dt):
        dt.materials = list(df.materials)
    mats = [m for m in dt.materials if m is not None]
    m = mats[0]
    m.name = 'BK_' + key
    USED_BK.add(aid)
    nt = m.node_tree
    # drop displacement entirely (bump evaluates the texture graph 3x on CPU)
    m.displacement_method = 'BUMP'
    for n in nt.nodes:
        if n.type == 'OUTPUT_MATERIAL':
            for l in list(n.inputs['Displacement'].links):
                nt.links.remove(l)
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE' and n.image is not None:
            n.interpolation = 'Linear'
    return m


def node(nt, typ, loc=(0, 0), **props):
    n = nt.nodes.new(typ)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def principled(name, color=(0.5, 0.5, 0.5), metallic=0.0, rough=0.5, coat=0.0, emission=None, em_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = em_strength
    b.inputs['Alpha'].default_value = alpha
    return m


def tint_bsdf(m, color=None, rough_mul=None, metallic=None):
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            if color is not None:
                inp = n.inputs['Base Color']
                for l in list(inp.links):
                    m.node_tree.links.remove(l)
                inp.default_value = (*color, 1)
            if metallic is not None:
                inp = n.inputs['Metallic']
                for l in list(inp.links):
                    m.node_tree.links.remove(l)
                inp.default_value = metallic


# ----------------------------------------------------------------------------
# Controller node group: animated values shared by all wrapped materials.
CTL_VALUES = ['e_gpos', 'e_front', 'e_glow', 'c_gpos', 'c_glow', 'e_sect', 'c_vis']


def ctl_group():
    if 'CTL' in bpy.data.node_groups:
        return bpy.data.node_groups['CTL']
    ng = bpy.data.node_groups.new('CTL', 'ShaderNodeTree')
    ng.interface.new_socket('dummy', in_out='INPUT', socket_type='NodeSocketFloat')
    out = ng.nodes.new('NodeGroupOutput')
    for i, name in enumerate(CTL_VALUES):
        ng.interface.new_socket(name, in_out='OUTPUT', socket_type='NodeSocketFloat')
        v = ng.nodes.new('ShaderNodeValue')
        v.name = name
        v.label = name
        v.location = (-300, -i * 120)
        ng.links.new(v.outputs[0], out.inputs[name])
    defaults = {'e_gpos': -2.0, 'e_front': 1.0, 'e_glow': 1.0, 'c_gpos': -9.0, 'c_glow': 1.0, 'e_sect': 0.0, 'c_vis': 1.0}
    for k, val in defaults.items():
        ng.nodes[k].outputs[0].default_value = val
    return ng


def _math(nt, op, a=None, b=None, loc=(0, 0), clamp=False):
    n = node(nt, 'ShaderNodeMath', loc, operation=op)
    n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def ghost_wrap(m, kind, origin_y=0.0, ghost_col=(0.35, 0.6, 1.0), cap=False, ghost=True, inner=False, rim_k=0.22, alpha_k=0.26, gloss=(0.04, 0.05, 0.07)):
    """Insert x-ray/visibility logic before the material output.

    kind='engine': ghost where (P.y - origin_y) < e_gpos ; visibility for
                   objects with custom prop isfront=1 multiplied by e_front.
    kind='car'   : ghost where P.y < c_gpos.
    cap=True     : section cap faces -> transparent when ghost, invisible
                   unless e_sect.
    """
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    src = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
    x0 = out.location.x
    out.location.x += 1400
    ctl = node(nt, 'ShaderNodeGroup', (x0, -600))
    ctl.node_tree = ctl_group()
    geo = node(nt, 'ShaderNodeNewGeometry', (x0, -300))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (x0 + 180, -300))
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    if kind == 'engine':
        y = _math(nt, 'SUBTRACT', sep.outputs['Y'], origin_y, (x0 + 360, -300))
        gpos, glow_k = ctl.outputs['e_gpos'], ctl.outputs['e_glow']
    else:
        y = sep.outputs['Y']
        gpos, glow_k = ctl.outputs['c_gpos'], ctl.outputs['c_glow']
    soft = 0.012 if kind == 'engine' else 0.05
    d = _math(nt, 'SUBTRACT', gpos, y, (x0 + 540, -300))          # >0 => ghost
    fac = _math(nt, 'MULTIPLY_ADD', d, 1.0 / soft, (x0 + 720, -300))
    nt.nodes[fac.node.name].inputs[2].default_value = 0.5
    fac.node.use_clamp = True
    # scan glow band around the sweep plane
    ad = _math(nt, 'ABSOLUTE', d, None, (x0 + 540, -450))
    band_w = 0.02 if kind == 'engine' else 0.06
    band = _math(nt, 'SUBTRACT', 1.0, _math(nt, 'DIVIDE', ad, band_w, (x0 + 720, -450), clamp=True), (x0 + 900, -450), clamp=True)
    band = _math(nt, 'POWER', band, 3.0, (x0 + 1080, -450))
    band = _math(nt, 'MULTIPLY', band, glow_k, (x0 + 1260, -450))
    # ghost look: transparent glass with blue fresnel rim + faint glossy
    lw = node(nt, 'ShaderNodeLayerWeight', (x0 + 540, -750))
    lw.inputs['Blend'].default_value = 0.35
    rim = _math(nt, 'POWER', lw.outputs['Facing'], 2.2, (x0 + 720, -750))
    alpha = _math(nt, 'MULTIPLY_ADD', rim, alpha_k, (x0 + 900, -750))
    alpha.node.inputs[2].default_value = 0.02
    em = node(nt, 'ShaderNodeEmission', (x0 + 900, -900))
    em.inputs['Color'].default_value = (*ghost_col, 1)
    emk = _math(nt, 'MULTIPLY', rim, rim_k, (x0 + 1080, -900))
    nt.links.new(emk, em.inputs['Strength'])
    gl = node(nt, 'ShaderNodeBsdfGlossy', (x0 + 900, -1050))
    gl.inputs['Color'].default_value = (*gloss, 1)
    gl.inputs['Roughness'].default_value = 0.15
    add = node(nt, 'ShaderNodeAddShader', (x0 + 1080, -1000))
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(gl.outputs[0], add.inputs[1])
    tr = node(nt, 'ShaderNodeBsdfTransparent', (x0 + 1080, -1150))
    gmix = node(nt, 'ShaderNodeMixShader', (x0 + 1260, -1000))
    nt.links.new(alpha, gmix.inputs[0])
    nt.links.new(tr.outputs[0], gmix.inputs[1])
    nt.links.new(add.outputs[0], gmix.inputs[2])
    ghost_sh = gmix.outputs[0]
    if cap or inner:
        ghost_sh = tr.outputs[0]
    mix1 = node(nt, 'ShaderNodeMixShader', (x0 + 1440, -200))
    if ghost:
        nt.links.new(fac, mix1.inputs[0])
    else:
        mix1.inputs[0].default_value = 0.0
        band = _math(nt, 'MULTIPLY', band, 0.0, (x0 + 1300, -520))
    if src is not None:
        nt.links.new(src, mix1.inputs[1])
    nt.links.new(ghost_sh, mix1.inputs[2])
    # scan line emission (orange for engine, cool blue for car)
    sem = node(nt, 'ShaderNodeEmission', (x0 + 1440, -450))
    sem.inputs['Color'].default_value = (0.35, 0.68, 1.0, 1)
    nt.links.new(_math(nt, 'MULTIPLY', band, 6.0 if kind == 'engine' else 2.5, (x0 + 1440, -600)), sem.inputs['Strength'])
    add2 = node(nt, 'ShaderNodeAddShader', (x0 + 1620, -250))
    nt.links.new(mix1.outputs[0], add2.inputs[0])
    nt.links.new(sem.outputs[0], add2.inputs[1])
    final = add2.outputs[0]
    # visibility (front pieces in section mode, caps)
    if kind == 'engine':
        att = node(nt, 'ShaderNodeAttribute', (x0 + 1440, -800), attribute_type='OBJECT', attribute_name='isfront')
        # vis = 1 - isfront*(1-e_front)
        one_minus = _math(nt, 'SUBTRACT', 1.0, ctl.outputs['e_front'], (x0 + 1620, -800))
        hide = _math(nt, 'MULTIPLY', att.outputs['Fac'], one_minus, (x0 + 1800, -800))
        vis = _math(nt, 'SUBTRACT', 1.0, hide, (x0 + 1980, -800), clamp=True)
        if cap:
            # caps only exist visually in section mode on back pieces
            vis = _math(nt, 'MULTIPLY', vis, ctl.outputs['e_sect'], (x0 + 2160, -800))
        tr2 = node(nt, 'ShaderNodeBsdfTransparent', (x0 + 1980, -400))
        vmix = node(nt, 'ShaderNodeMixShader', (x0 + 2160, -250))
        nt.links.new(vis, vmix.inputs[0])
        nt.links.new(tr2.outputs[0], vmix.inputs[1])
        nt.links.new(final, vmix.inputs[2])
        final = vmix.outputs[0]
    if kind == 'car':
        trc = node(nt, 'ShaderNodeBsdfTransparent', (x0 + 1800, -450))
        cm = node(nt, 'ShaderNodeMixShader', (x0 + 1980, -250))
        nt.links.new(ctl.outputs['c_vis'], cm.inputs[0])
        nt.links.new(trc.outputs[0], cm.inputs[1])
        nt.links.new(final, cm.inputs[2])
        final = cm.outputs[0]
    nt.links.new(final, out.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    return m


def gas_material():
    """Shared gas surface shader (emissive, semi-transparent). Per-object props:
    gas_col (rgb), gas_den, gas_em_col (rgb), gas_em, flame_r, flame_em, plug (xyz world).
    On the half-section cut face the flame front reads as an expanding arc."""
    m = bpy.data.materials.new('GasSurface')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    out = nt.nodes['Material Output']

    def att(name, y):
        return node(nt, 'ShaderNodeAttribute', (-1100, y), attribute_type='OBJECT', attribute_name=name)
    a_col, a_den = att('gas_col', 0), att('gas_den', -150)
    a_ecol, a_em = att('gas_em_col', -300), att('gas_em', -450)
    a_fr, a_fem, a_plug = att('flame_r', -600), att('flame_em', -750), att('plug', -900)
    geo = node(nt, 'ShaderNodeNewGeometry', (-1100, -1050))
    dist = node(nt, 'ShaderNodeVectorMath', (-900, -950), operation='DISTANCE')
    nt.links.new(geo.outputs['Position'], dist.inputs[0])
    nt.links.new(a_plug.outputs['Vector'], dist.inputs[1])
    d = dist.outputs['Value']
    r = a_fr.outputs['Fac']
    mr = node(nt, 'ShaderNodeMapRange', (-700, -700), interpolation_type='SMOOTHSTEP')
    nt.links.new(d, mr.inputs['Value'])
    nt.links.new(_math(nt, 'SUBTRACT', r, 0.002, (-900, -700)), mr.inputs['From Min'])
    nt.links.new(_math(nt, 'ADD', r, 0.002, (-900, -800)), mr.inputs['From Max'])
    mr.inputs['To Min'].default_value = 1.0
    mr.inputs['To Max'].default_value = 0.0
    inside = mr.outputs['Result']
    x = _math(nt, 'DIVIDE', _math(nt, 'SUBTRACT', d, r, (-700, -1000)), 0.0028, (-550, -1000))
    front = _math(nt, 'EXPONENT', _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', x, x, (-400, -1000)), -1.0, (-250, -1000)), None, (-100, -1000))
    noise = node(nt, 'ShaderNodeTexNoise', (-700, -1250))
    noise.inputs['Scale'].default_value = 110.0
    noise.inputs['Detail'].default_value = 3.0
    noise.inputs['Roughness'].default_value = 0.6
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    nz = _math(nt, 'MULTIPLY_ADD', noise.outputs['Fac'], 1.3, (-500, -1250))
    nz.node.inputs[2].default_value = 0.35
    flame_on = _math(nt, 'GREATER_THAN', r, 0.0, (-500, -600))
    burn = _math(nt, 'MULTIPLY', inside, flame_on, (-300, -700))
    fl = _math(nt, 'MULTIPLY', _math(nt, 'ADD', _math(nt, 'MULTIPLY', front, 2.5, (50, -1000)), burn, (200, -900)),
               _math(nt, 'MULTIPLY', a_fem.outputs['Fac'], nz, (50, -1150)), (350, -900))
    base_em = _math(nt, 'MULTIPLY', a_em.outputs['Fac'], nz, (-100, -450))
    em_tot = _math(nt, 'ADD', base_em, fl, (500, -700))
    emc = node(nt, 'ShaderNodeMix', (0, -300), data_type='RGBA')
    nt.links.new(burn, emc.inputs['Factor'])
    nt.links.new(a_ecol.outputs['Color'], emc.inputs['A'])
    emc.inputs['B'].default_value = (1.0, 0.42, 0.08, 1)
    # front itself whiter/yellow
    emc2 = node(nt, 'ShaderNodeMix', (200, -300), data_type='RGBA')
    nt.links.new(_math(nt, 'MINIMUM', front, 1.0, (100, -500)), emc2.inputs['Factor'])
    nt.links.new(emc.outputs['Result'], emc2.inputs['A'])
    emc2.inputs['B'].default_value = (1.0, 0.78, 0.4, 1)
    # tint of the gas body itself (unlit, so it reads in the dark)
    body = node(nt, 'ShaderNodeMix', (200, 0), data_type='RGBA')
    nt.links.new(burn, body.inputs['Factor'])
    nt.links.new(a_col.outputs['Color'], body.inputs['A'])
    body.inputs['B'].default_value = (1.0, 0.45, 0.1, 1)
    em1 = node(nt, 'ShaderNodeEmission', (600, -100))
    nt.links.new(body.outputs['Result'], em1.inputs['Color'])
    em1.inputs['Strength'].default_value = 0.18
    em2 = node(nt, 'ShaderNodeEmission', (600, -300))
    nt.links.new(emc2.outputs['Result'], em2.inputs['Color'])
    nt.links.new(em_tot, em2.inputs['Strength'])
    add = node(nt, 'ShaderNodeAddShader', (800, -200))
    nt.links.new(em1.outputs[0], add.inputs[0])
    nt.links.new(em2.outputs[0], add.inputs[1])
    # opacity: density + flame
    a1 = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', a_den.outputs['Fac'], 0.021, (-300, -150)), nz, (-100, -150))
    a2 = _math(nt, 'MULTIPLY', fl, 0.05, (500, -500))
    alpha = _math(nt, 'MINIMUM', _math(nt, 'ADD', a1, a2, (650, -450)), 0.9, (800, -450))
    tr = node(nt, 'ShaderNodeBsdfTransparent', (800, 100))
    mix = node(nt, 'ShaderNodeMixShader', (1000, 0))
    nt.links.new(alpha, mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(add.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    return m


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    em = node(nt, 'ShaderNodeEmission', (0, 0))
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def particle_material(name, color, em_color, em_strength, alpha=1.0, use_heat=False):
    m = principled(name, color=color, rough=0.6, emission=em_color, em_strength=em_strength, alpha=alpha)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    if use_heat:
        att = node(nt, 'ShaderNodeAttribute', (-600, -200), attribute_type='GEOMETRY', attribute_name='heat')
        mul = _math(nt, 'MULTIPLY', att.outputs['Fac'], em_strength, (-400, -200))
        nt.links.new(mul, b.inputs['Emission Strength'])
    att2 = node(nt, 'ShaderNodeAttribute', (-600, -400), attribute_type='GEOMETRY', attribute_name='fade')
    nt.links.new(_math(nt, 'MULTIPLY', att2.outputs['Fac'], alpha, (-400, -400)), b.inputs['Alpha'])
    return m
