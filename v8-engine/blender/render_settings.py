"""Cycles settings for CPU preview rendering."""
import os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def apply(sc, res=(540, 960), samples=24):
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.04
    cy.adaptive_min_samples = 8
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    try:
        cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        cy.denoising_prefilter = 'ACCURATE'
    except Exception:
        pass
    cy.max_bounces = 6
    cy.diffuse_bounces = 2
    cy.glossy_bounces = 2
    cy.transmission_bounces = 4
    cy.volume_bounces = 0
    cy.transparent_max_bounces = 12
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.sample_clamp_indirect = 6.0
    cy.blur_glossy = 1.0
    cy.volume_step_rate = 2.0
    cy.volume_max_steps = 256
    cy.use_light_tree = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.45
    sc.render.use_persistent_data = True
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = -0.6
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'
    sc.render.threads_mode = 'AUTO'
