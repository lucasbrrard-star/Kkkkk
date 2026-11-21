import bpy, sys, glob, json, os
for p in sorted(glob.glob(os.path.join(sys.argv[sys.argv.index('--')+1], '*.blend'))):
    meta = json.load(open(p[:-6]+'.json'))
    if meta['type'] != 'material': continue
    with bpy.data.libraries.load(p) as (df, dt):
        dt.materials = list(df.materials)
    for m in dt.materials:
        if not m or not m.use_nodes: continue
        nodes = [(n.type, getattr(n, 'projection', ''), n.image.name if getattr(n, 'image', None) else '') for n in m.node_tree.nodes]
        print(meta['assetBaseId'][:8], meta['name'], '->', m.name, [x for x in nodes if x[0] not in ('REROUTE','FRAME')][:14])
