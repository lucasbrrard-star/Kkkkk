import * as THREE from 'three';

/** Layer used by objects that must NOT appear in the reflection (the ground itself, rain, decals). */
export const LAYER_NO_REFLECT = 1;

/**
 * Renders the scene mirrored across the y = 0 plane into a half-float render target with mipmaps.
 * The wet ground shader projects it with `textureMatrix` and blurs it along the view direction to
 * obtain the long streaky reflections typical of wet asphalt.
 */
export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  readonly camera = new THREE.PerspectiveCamera();
  enabled = true;
  scale: number;

  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly clipPlane = new THREE.Vector4();
  private readonly q = new THREE.Vector4();
  private readonly tmp = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), rot: new THREE.Matrix4(), look: new THREE.Vector3() };

  constructor(scale: number) {
    this.scale = scale;
    this.target = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    this.target.texture.name = 'PlanarReflection';
    this.camera.layers.set(0);
  }

  setSize(w: number, h: number) {
    const s = Math.max(0.1, this.scale);
    this.target.setSize(Math.max(16, Math.round(w * s)), Math.max(16, Math.round(h * s)));
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.enabled) return;
    const { pos, target, up, rot, look } = this.tmp;
    const normal = this.plane.normal;
    // mirror the camera position, view target and up vector
    pos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(pos);
    const mirror = (v: THREE.Vector3) => v.sub(normal.clone().multiplyScalar(2 * this.plane.distanceToPoint(v)));
    const cam = this.camera;
    cam.position.copy(mirror(pos.clone()));
    target.copy(mirror(look.clone()));
    up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.up.copy(up);
    cam.lookAt(target);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    // texture matrix: world -> reflection texture uv
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    // oblique near plane = reflection plane (clips everything below the ground)
    const p = new THREE.Plane().copy(this.plane).applyMatrix4(cam.matrixWorldInverse);
    this.clipPlane.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
    const proj = cam.projectionMatrix;
    const q = this.q;
    q.x = (Math.sign(this.clipPlane.x) + proj.elements[8]) / proj.elements[0];
    q.y = (Math.sign(this.clipPlane.y) + proj.elements[9]) / proj.elements[5];
    q.z = -1.0;
    q.w = (1.0 + proj.elements[10]) / proj.elements[14];
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(q));
    proj.elements[2] = this.clipPlane.x;
    proj.elements[6] = this.clipPlane.y;
    proj.elements[10] = this.clipPlane.z + 1.0 - 0.003;
    proj.elements[14] = this.clipPlane.w;

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevAutoClear = renderer.autoClear;
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    renderer.autoClear = prevAutoClear;
  }

  dispose() { this.target.dispose(); }
}
