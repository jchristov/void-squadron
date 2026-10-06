import * as THREE from 'three';
import { createShipModel } from './models.ts';
import { SHIPS, type ShipClass } from './rules.ts';

const WIDTH = 360;
const HEIGHT = 220;

/**
 * Renders each hangar ship once through a throwaway WebGL context so the tiles show the real 3D models.
 * Returns an empty map when WebGL is unavailable; callers fall back to the line icons.
 */
export function renderShipThumbnails(): Partial<Record<ShipClass, string>> {
  const result: Partial<Record<ShipClass, string>> = {};
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1a2230, 1.25));
    const key = new THREE.DirectionalLight(0xfff0d8, 3.1);
    key.position.set(-4, 5, 6);
    const rim = new THREE.DirectionalLight(0x6fd8ff, 2.2);
    rim.position.set(5, 1.5, -5);
    scene.add(key, rim);
    const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 400);

    for (const ship of Object.keys(SHIPS) as ShipClass[]) {
      const model = createShipModel(ship, { accent: 0x8be3ff, tint: 0x8a97aa });
      model.rotation.set(0.42, -0.72, -0.12);
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      model.position.sub(sphere.center);
      const holder = new THREE.Group();
      holder.add(model);
      scene.add(holder);
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const distance = (sphere.radius / Math.sin(Math.min(fov / 2, (fov * WIDTH) / HEIGHT / 2))) * 0.8;
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      result[ship] = canvas.toDataURL('image/png');
      scene.remove(holder);
      holder.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose?.();
      });
    }
  } catch (error) {
    console.warn('Ship thumbnails unavailable:', error);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return result;
}
