#!/bin/bash
# render retomável da sequência completa (pula quadros já existentes)
cd "$(dirname "$0")/.."
blender -b build/v8_scene.blend --python-expr "
import bpy
sc=bpy.context.scene
sc.render.use_overwrite=False
sc.render.use_placeholder=True
" -a >> build/frames/render.log 2>&1
echo FINISHED >> build/frames/render.log
