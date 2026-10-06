import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShipClass } from './rules';

export interface ShipModelOptions {
  accent?: number;
  tint?: number;
  scale?: number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let next = Math.imul(t ^ (t >>> 15), t | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createMetalMaterial(color: number, emissive = 0x000000, roughness = 0.46, metalness = 0.86): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness, metalness });
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addMirror(group: THREE.Group, builder: (side: number) => void): void {
  builder(1);
  builder(-1);
}

function createWindowStrip(width: number, height: number, depth: number, color: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x121a2b,
    emissive: color,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.35,
  });
  return new THREE.Mesh(geometry, material);
}

function createEngineGlow(color: number, radius: number, length: number): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(radius, length, 6, 1, true);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.y = 0.7;
  return mesh;
}

function createCockpit(color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshPhysicalMaterial({
      color: 0xbfdcff,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.9,
      roughness: 0.06,
      metalness: 0.02,
      transmission: 0.45,
      thickness: 0.25,
    }),
  );
}

function createAntenna(color: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.03, 0.05, 1.5, 5);
  const material = new THREE.MeshStandardMaterial({ color, emissive: 0x20304f, roughness: 0.35, metalness: 0.8 });
  return new THREE.Mesh(geometry, material);
}

function addThrusters(group: THREE.Group, count: number, span: number, z: number, size: number, color: number): void {
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    const x = THREE.MathUtils.lerp(-span, span, t);
    const glow = createEngineGlow(color, size, size * 2.8);
    glow.position.set(x, -0.05, z);
    group.add(glow);
  }
}

function buildFighter(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x10192a);
  const accentMaterial = createMetalMaterial(accent, accent, 0.26, 0.62);

  addMesh(group, new THREE.BoxGeometry(0.9, 0.5, 4.4), hull, [0, 0, 0]);
  addMesh(group, new THREE.ConeGeometry(0.52, 1.9, 4), hull, [0, 0, -3.1], [Math.PI / 2, Math.PI / 4, 0]);
  addMesh(group, new THREE.BoxGeometry(0.5, 0.3, 1.1), accentMaterial, [0, 0.32, -1.2], [0.18, 0, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(2.3, 0.1, 1.5), hull, [side * 1.45, -0.02, -0.35], [0.08, 0, -side * 0.42]);
    addMesh(group, new THREE.BoxGeometry(0.45, 0.15, 1.8), accentMaterial, [side * 2.35, -0.15, 1.15], [0, side * 0.18, 0]);
    addMesh(group, new THREE.BoxGeometry(0.12, 0.7, 0.9), hull, [side * 0.55, 0.55, 1.4], [0.18, 0, side * 0.08]);
  });

  const cockpit = createCockpit(accent);
  cockpit.position.set(0, 0.35, -0.75);
  group.add(cockpit);
  addThrusters(group, 2, 0.32, 2.4, 0.23, accent);
  return group;
}

function buildInterceptor(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x0f1524);
  const bright = createMetalMaterial(accent, accent, 0.22, 0.68);

  addMesh(group, new THREE.BoxGeometry(0.6, 0.32, 5.2), hull, [0, 0, -0.2]);
  addMesh(group, new THREE.ConeGeometry(0.38, 2.5, 4), hull, [0, 0.02, -4.0], [Math.PI / 2, Math.PI / 4, 0]);
  addMesh(group, new THREE.BoxGeometry(0.34, 0.22, 1.6), bright, [0, 0.28, -2.1], [0.25, 0, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(1.9, 0.08, 2.8), hull, [side * 1.2, -0.05, -0.4], [0, side * 0.12, -side * 0.72]);
    addMesh(group, new THREE.BoxGeometry(0.18, 0.9, 1.1), bright, [side * 1.9, 0.55, 0.95], [0.1, 0, side * 0.15]);
    addMesh(group, new THREE.BoxGeometry(0.26, 0.18, 2.0), bright, [side * 0.54, -0.2, 1.8], [0, 0, side * 0.2]);
  });
  const cockpit = createCockpit(accent);
  cockpit.scale.setScalar(0.78);
  cockpit.position.set(0, 0.28, -1.45);
  group.add(cockpit);
  addThrusters(group, 2, 0.28, 2.55, 0.18, accent);
  return group;
}

function buildBomber(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x141825);
  const bright = createMetalMaterial(accent, accent, 0.28, 0.58);

  addMesh(group, new THREE.BoxGeometry(1.15, 0.72, 4.9), hull, [0, 0, -0.2]);
  addMesh(group, new THREE.ConeGeometry(0.72, 2.05, 4), hull, [0, -0.02, -3.45], [Math.PI / 2, Math.PI / 4, 0]);
  addMesh(group, new THREE.BoxGeometry(0.84, 0.24, 1.7), bright, [0, 0.52, -0.65], [0.14, 0, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(2.9, 0.18, 2.1), hull, [side * 1.8, 0.03, -0.2], [0, 0, -side * 0.22]);
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.24, 1.8, 8), bright, [side * 1.1, -0.54, -0.5], [Math.PI / 2, 0, 0]);
    addMesh(group, new THREE.BoxGeometry(0.32, 0.82, 1.4), hull, [side * 2.5, 0.44, 1.15], [0.08, 0, side * 0.08]);
  });
  const cockpit = createCockpit(accent);
  cockpit.position.set(0, 0.42, -1.4);
  group.add(cockpit);
  addThrusters(group, 3, 0.45, 2.65, 0.24, accent);
  return group;
}

function buildShuttle(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x151d31);
  const bright = createMetalMaterial(accent, accent, 0.26, 0.55);

  addMesh(group, new THREE.BoxGeometry(1.05, 0.55, 4.3), hull, [0, 0.1, 0]);
  addMesh(group, new THREE.ConeGeometry(0.64, 1.9, 4), hull, [0, 0.08, -3.0], [Math.PI / 2, Math.PI / 4, 0]);
  addMesh(group, new THREE.BoxGeometry(1.6, 0.16, 3.2), hull, [0, -0.08, 0.4], [0.05, 0, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(2.3, 0.12, 1.8), hull, [side * 1.62, 0.02, -0.15], [0.12, 0, -side * 0.28]);
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.22, 2.6, 8), bright, [side * 2.3, -0.15, 0.55], [Math.PI / 2, 0, side * 0.14]);
    addMesh(group, new THREE.BoxGeometry(0.18, 1.05, 0.95), hull, [side * 1.2, 0.66, 1.5], [0.05, 0, side * 0.15]);
  });
  const cockpit = createCockpit(accent);
  cockpit.scale.set(0.9, 0.75, 1.05);
  cockpit.position.set(0, 0.48, -1.0);
  group.add(cockpit);
  addThrusters(group, 2, 0.7, 2.3, 0.24, accent);
  return group;
}

function buildFreighter(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x171d28);
  const bright = createMetalMaterial(accent, accent, 0.32, 0.52);

  addMesh(group, new THREE.BoxGeometry(1.3, 0.86, 5.4), hull, [0, 0.1, -0.1]);
  addMesh(group, new THREE.BoxGeometry(0.82, 0.54, 2.2), bright, [0, 0.68, -1.0], [0.12, 0, 0]);
  addMesh(group, new THREE.ConeGeometry(0.78, 1.7, 4), hull, [0, 0.04, -3.9], [Math.PI / 2, Math.PI / 4, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(0.95, 0.95, 2.3), hull, [side * 1.35, -0.18, 0.05], [0, side * 0.08, 0]);
    addMesh(group, new THREE.BoxGeometry(0.72, 0.72, 1.7), bright, [side * 2.25, -0.28, 0.75], [0, side * 0.2, 0]);
    addMesh(group, new THREE.BoxGeometry(0.22, 1.15, 1.2), hull, [side * 0.78, 0.74, 1.4], [0.08, 0, side * 0.12]);
  });
  const cockpit = createCockpit(accent);
  cockpit.scale.set(0.8, 0.7, 0.95);
  cockpit.position.set(0, 0.58, -1.85);
  group.add(cockpit);
  addThrusters(group, 4, 0.75, 2.95, 0.24, accent);
  return group;
}

function buildDestroyer(accent: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(tint, 0x181d2d, 0.5, 0.94);
  const bright = createMetalMaterial(accent, accent, 0.24, 0.66);

  addMesh(group, new THREE.BoxGeometry(1.65, 0.9, 7.2), hull, [0, 0.15, -0.3]);
  addMesh(group, new THREE.BoxGeometry(1.25, 0.46, 3.2), bright, [0, 0.84, -1.2], [0.08, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(2.3, 0.16, 5.0), hull, [0, -0.16, 0.6]);
  addMesh(group, new THREE.ConeGeometry(1.0, 3.3, 4), hull, [0, 0.05, -5.2], [Math.PI / 2, Math.PI / 4, 0]);
  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(3.4, 0.25, 2.2), hull, [side * 2.1, 0.02, -0.35], [0.03, 0, -side * 0.16]);
    addMesh(group, new THREE.BoxGeometry(1.1, 0.44, 2.7), bright, [side * 2.9, -0.1, 0.6], [0, side * 0.08, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.08, 0.12, 2.1, 7), bright, [side * 1.05, 0.54, -3.2], [Math.PI / 2, side * 0.12, 0]);
    addMesh(group, new THREE.BoxGeometry(0.2, 1.2, 1.8), hull, [side * 0.95, 1.0, 1.6], [0.08, 0, side * 0.09]);
  });
  const bridge = createCockpit(accent);
  bridge.scale.set(1.15, 0.9, 1.25);
  bridge.position.set(0, 1.0, -2.0);
  group.add(bridge);
  addThrusters(group, 6, 0.95, 3.65, 0.26, accent);
  return group;
}

function classPalette(shipClass: ShipClass): { accent: number; tint: number; scale: number } {
  switch (shipClass) {
    case 'interceptor':
      return { accent: 0x4fd4ff, tint: 0x778aa0, scale: 0.92 };
    case 'bomber':
      return { accent: 0xff8c42, tint: 0x7a736f, scale: 1.08 };
    case 'shuttle':
      return { accent: 0x88ffd5, tint: 0x7d858f, scale: 1.02 };
    case 'freighter':
      return { accent: 0xf0bb63, tint: 0x7b726a, scale: 1.18 };
    case 'destroyer':
      return { accent: 0xff5d8f, tint: 0x707383, scale: 1.34 };
    case 'fighter':
    default:
      return { accent: 0x86a9ff, tint: 0x7f8897, scale: 1 };
  }
}

export function createShipModel(shipClass: ShipClass, options: ShipModelOptions = {}): THREE.Group {
  const palette = classPalette(shipClass);
  const accent = options.accent ?? palette.accent;
  const tint = options.tint ?? palette.tint;

  let group: THREE.Group;
  switch (shipClass) {
    case 'interceptor':
      group = buildInterceptor(accent, tint);
      break;
    case 'bomber':
      group = buildBomber(accent, tint);
      break;
    case 'shuttle':
      group = buildShuttle(accent, tint);
      break;
    case 'freighter':
      group = buildFreighter(accent, tint);
      break;
    case 'destroyer':
      group = buildDestroyer(accent, tint);
      break;
    case 'fighter':
    default:
      group = buildFighter(accent, tint);
      break;
  }

  const antenna = createAntenna(tint);
  antenna.position.set(0, 0.52, 1.0);
  antenna.rotation.z = 0.05;
  antenna.scale.setScalar(shipClass === 'destroyer' ? 1.2 : 0.85);
  group.add(antenna);

  const windows = createWindowStrip(shipClass === 'destroyer' ? 0.55 : 0.36, 0.08, shipClass === 'destroyer' ? 1.4 : 0.9, accent);
  windows.position.set(0, shipClass === 'destroyer' ? 0.95 : 0.42, shipClass === 'destroyer' ? -0.95 : -0.62);
  group.add(windows);

  const scale = options.scale ?? palette.scale;
  group.scale.setScalar(scale);
  return group;
}

export function createCapitalCarrier(): THREE.Group {
  const group = new THREE.Group();
  const hull = createMetalMaterial(0x687183, 0x121824, 0.54, 0.96);
  const plating = createMetalMaterial(0x8392a8, 0x1c2331, 0.46, 0.9);
  const glow = createMetalMaterial(0x4dc4ff, 0x4dc4ff, 0.18, 0.45);

  addMesh(group, new THREE.BoxGeometry(10.5, 1.8, 24), hull, [0, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(8.6, 1.2, 14.5), plating, [0, 1.15, -2.8]);
  addMesh(group, new THREE.BoxGeometry(6.4, 0.95, 9.5), plating, [0, 2.0, -6.0]);
  addMesh(group, new THREE.BoxGeometry(12.2, 0.42, 8.5), hull, [0, -0.92, 4.0]);
  addMesh(group, new THREE.BoxGeometry(8.4, 0.52, 10.5), plating, [0, -0.58, -7.8]);
  addMesh(group, new THREE.ConeGeometry(3.2, 10.5, 4), hull, [0, 0.1, -17.3], [Math.PI / 2, Math.PI / 4, 0]);

  addMirror(group, (side) => {
    addMesh(group, new THREE.BoxGeometry(2.1, 0.74, 16.0), hull, [side * 5.6, 0.08, 1.5], [0, 0, -side * 0.08]);
    addMesh(group, new THREE.BoxGeometry(1.6, 0.34, 7.4), plating, [side * 4.2, -0.7, -7.5], [0, side * 0.12, 0]);
    addMesh(group, new THREE.BoxGeometry(0.42, 2.0, 4.2), plating, [side * 3.1, 2.4, -4.3], [0.08, 0, side * 0.18]);
    for (let i = 0; i < 4; i += 1) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.3, 7), glow);
      turret.position.set(side * (2.4 + i * 1.1), 0.92, -5.5 + i * 3.4);
      turret.rotation.z = Math.PI / 2;
      turret.rotation.y = side * 0.2;
      group.add(turret);
    }
  });

  for (let i = 0; i < 5; i += 1) {
    const slit = createWindowStrip(1.25, 0.1, 0.2, 0x76d8ff);
    slit.position.set(0, 0.32 + i * 0.34, -4.3 + i * 3.0);
    group.add(slit);
  }

  // Visual Subsystem Domes, Bridge, and Ventral Hangar
  const domeMat = createMetalMaterial(0x4fd4ff, 0x1d6688, 0.2, 0.4);
  const bridgeMat = createMetalMaterial(0xff776c, 0x661818, 0.3, 0.6);
  const hangarMat = createMetalMaterial(0xffba75, 0x664010, 0.3, 0.5);

  const portDome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), domeMat);
  portDome.position.set(-6.2, 3.8, -4.2);
  portDome.name = 'subsystem_shield_gen_port';
  group.add(portDome);

  const stbdDome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), domeMat);
  stbdDome.position.set(6.2, 3.8, -4.2);
  stbdDome.name = 'subsystem_shield_gen_starboard';
  group.add(stbdDome);

  const bridgeTower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.2), bridgeMat);
  bridgeTower.position.set(0, 4.2, -6.0);
  bridgeTower.name = 'subsystem_bridge';
  group.add(bridgeTower);

  const hangarBay = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 6.0), hangarMat);
  hangarBay.position.set(0, -2.4, 4.5);
  hangarBay.name = 'subsystem_hangar_bay';
  group.add(hangarBay);

  addThrusters(group, 7, 3.2, 12.8, 0.45, 0x53c7ff);
  group.scale.setScalar(1.45);
  return group;
}

function createNebulaTexture(size = 1024, seed = 12): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create nebula texture.');
  }

  const random = mulberry32(seed);
  const gradient = context.createRadialGradient(size * 0.52, size * 0.46, size * 0.08, size * 0.5, size * 0.5, size * 0.72);
  gradient.addColorStop(0, '#25195b');
  gradient.addColorStop(0.3, '#122447');
  gradient.addColorStop(0.65, '#070d1b');
  gradient.addColorStop(1, '#01030a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  context.globalCompositeOperation = 'screen';
  for (let i = 0; i < 22; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.08 + random() * 0.18);
    const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
    const hue = 190 + Math.floor(random() * 110);
    cloud.addColorStop(0, `hsla(${hue}, 80%, 62%, ${0.18 + random() * 0.18})`);
    cloud.addColorStop(0.45, `hsla(${hue + 30}, 72%, 55%, ${0.08 + random() * 0.12})`);
    cloud.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    context.fillStyle = cloud;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 1800; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = 0.18 + random() * 0.82;
    const starSize = random() > 0.96 ? 2.2 + random() * 2.2 : 0.5 + random() * 1.25;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fillRect(x, y, starSize, starSize);
    if (random() > 0.992) {
      context.strokeStyle = `rgba(169,208,255,${alpha * 0.8})`;
      context.beginPath();
      context.moveTo(x - 4, y);
      context.lineTo(x + 4, y);
      context.moveTo(x, y - 4);
      context.lineTo(x, y + 4);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createPlanetTexture(size = 1024, seed = 33): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create planet texture.');
  }

  const random = mulberry32(seed);
  const base = context.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#132e55');
  base.addColorStop(0.35, '#1f6093');
  base.addColorStop(0.68, '#164779');
  base.addColorStop(1, '#0c2548');
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 18; i += 1) {
    const x = random() * size;
    const y = size * (0.15 + random() * 0.7);
    const radius = 35 + random() * 100;
    context.fillStyle = ['#537c6a', '#71937b', '#998d6c'][i % 3];
    context.beginPath();
    for (let point = 0; point <= 90; point += 1) {
      const angle = point / 90 * Math.PI * 2;
      const edge = radius * (0.7 + Math.sin(angle * 3 + i) * 0.15 + Math.cos(angle * 7) * 0.08 + random() * 0.1);
      const px = x + Math.cos(angle) * edge;
      const py = y + Math.sin(angle) * edge * 0.65;
      if (point === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }

  context.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 100; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 14 + random() * 80;
    const shadow = context.createRadialGradient(x, y, 0, x, y, radius);
    shadow.addColorStop(0, `rgba(18,14,16,${0.15 + random() * 0.18})`);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = shadow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  for (let cloud = 0; cloud < 420; cloud += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 12 + random() * 50;
    const mist = context.createRadialGradient(x, y, 0, x, y, radius);
    mist.addColorStop(0, `rgba(235,246,255,${0.15 + random() * 0.4})`);
    mist.addColorStop(1, 'rgba(235,246,255,0)');
    context.fillStyle = mist;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.3, -0.25, 0, Math.PI * 2);
    context.fill();
  }
  for (let band = 0; band < 20; band += 1) {
    const y = random() * size;
    context.strokeStyle = `rgba(223,239,250,${0.08 + random() * 0.2})`;
    context.lineWidth = 2 + random() * 8;
    context.beginPath();
    context.moveTo(-20, y);
    for (let x = 0; x <= size + 20; x += 20) {
      context.lineTo(x, y + Math.sin(x * 0.013 + band) * (8 + random() * 16));
    }
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const BACKDROP_STAR_BASE = 2800;

/** Backdrop stars are allocated at twice the default so density can go up to 200% by changing the draw range. */
export function createSpaceBackdrop(): THREE.Group {
  const group = new THREE.Group();

  const skyTexture = createNebulaTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 40, 28),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide }),
  );
  group.add(sky);

  const starsGeometry = new THREE.BufferGeometry();
  const starCount = BACKDROP_STAR_BASE * 2;
  const positions = new Float32Array(starCount * 3);
  const random = mulberry32(72);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 110 + random() * 180;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.lerp(-1, 1, random()));
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.85, sizeAttenuation: true, transparent: true, opacity: 0.9 }),
  );
  starsGeometry.setDrawRange(0, BACKDROP_STAR_BASE);
  group.userData.setStarDensity = (density: number) => starsGeometry.setDrawRange(0, Math.round(BACKDROP_STAR_BASE * THREE.MathUtils.clamp(density, 0, 2)));
  group.add(stars);

  return group;
}

export function createPlanet(radius = 24): THREE.Group {
  const group = new THREE.Group();
  const surfaceTexture = createPlanetTexture();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.ShaderMaterial({
      uniforms: { surface: { value: surfaceTexture }, sunDirection: { value: new THREE.Vector3(-0.8, 0.45, 0.7).normalize() } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D surface;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 terrain = texture2D(surface, vUv).rgb;
          float light = dot(normalize(vNormal), sunDirection);
          float daylight = smoothstep(-0.22, 0.7, light);
          vec3 color = terrain * (0.12 + daylight * 0.95);
          color += vec3(0.03, 0.09, 0.16) * (1.0 - daylight);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  group.add(planet);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.025, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        glowColor: { value: new THREE.Color(0x78c7ff) },
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0), 5.0);
          float alpha = clamp(fresnel * 0.32, 0.0, 0.32);
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,
    }),
  );
  group.add(atmosphere);
  return group;
}

/** Smooth 3D value noise; deterministic per seed so shared vertices always get identical displacement. */
function createNoise3(seed: number): (x: number, y: number, z: number) => number {
  const random = mulberry32(seed);
  const size = 64;
  const lattice = new Float32Array(size * size * size);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();
  const at = (x: number, y: number, z: number) => lattice[(((x & 63) * size) + (y & 63)) * size + (z & 63)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = fade(x - x0), fy = fade(y - y0), fz = fade(z - z0);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return lerp(
      lerp(lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), fx), lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), fx), fy),
      lerp(lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), fx), lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), fx), fy),
      fz,
    );
  };
}

/**
 * A closed, indexed rock: every vertex is displaced as a pure function of its direction, so neighbouring
 * faces share positions (no cracks to see through), with lumpy fbm, ridged detail, craters and tonal variation.
 */
export function createAsteroid(radius: number, seed: number): THREE.Mesh {
  const detail = radius > 4 ? 6 : radius > 2.2 ? 5 : 4;
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry, 1e-4);

  const random = mulberry32(seed);
  const noise = createNoise3(seed ^ 0x9e3779b9);
  const stretch = new THREE.Vector3(0.82 + random() * 0.36, 0.78 + random() * 0.34, 0.8 + random() * 0.4);
  const offset = new THREE.Vector3(random() * 40, random() * 40, random() * 40);
  const craters = Array.from({ length: 5 + Math.floor(random() * 5) }, () => {
    const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
    return { direction, size: 0.2 + random() * 0.3, depth: 0.05 + random() * 0.09 };
  });

  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const direction = new THREE.Vector3();
  const base = new THREE.Color(0xa8957f);
  const dark = new THREE.Color(0x645849);
  const light = new THREE.Color(0xd6c3a8);
  const tint = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    direction.fromBufferAttribute(position, index).normalize();
    const px = direction.x * 1.7 + offset.x, py = direction.y * 1.7 + offset.y, pz = direction.z * 1.7 + offset.z;
    const broad = noise(px, py, pz) * 0.6 + noise(px * 2.1, py * 2.1, pz * 2.1) * 0.28 + noise(px * 4.3, py * 4.3, pz * 4.3) * 0.12;
    const ridged = 1 - Math.abs(noise(px * 3.2 + 9, py * 3.2, pz * 3.2) * 2 - 1);
    let displacement = (broad - 0.5) * 0.46 + ridged * 0.07;
    let craterShade = 0;
    for (const crater of craters) {
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(crater.direction), -1, 1));
      const t = angle / crater.size;
      if (t < 1.35) {
        const bowl = t < 1 ? -(1 - t * t) * crater.depth : 0;
        const rim = Math.exp(-Math.pow((t - 1.06) * 5, 2)) * crater.depth * 0.45;
        displacement += bowl + rim;
        craterShade += t < 1 ? (1 - t) * 0.5 : 0;
      }
    }
    const length = 1 + displacement;
    position.setXYZ(index, direction.x * length * stretch.x * radius, direction.y * length * stretch.y * radius, direction.z * length * stretch.z * radius);

    const grain = noise(px * 6 + 3, py * 6, pz * 6);
    tint.copy(dark).lerp(base, THREE.MathUtils.clamp(0.35 + broad * 0.8, 0, 1)).lerp(light, THREE.MathUtils.clamp((ridged - 0.55) * 1.4 + (grain - 0.5) * 0.5, 0, 0.7));
    tint.multiplyScalar(1 - Math.min(0.55, craterShade));
    colors.set([tint.r, tint.g, tint.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.06,
    envMapIntensity: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createShieldShell(radius: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    }),
  );
}

function disposeMaterial(material: THREE.Material): void {
  const typedMaterial = material as THREE.Material & {
    map?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
  };
  typedMaterial.map?.dispose();
  typedMaterial.alphaMap?.dispose();
  typedMaterial.emissiveMap?.dispose();
  typedMaterial.normalMap?.dispose();
  typedMaterial.roughnessMap?.dispose();
  typedMaterial.metalnessMap?.dispose();
  material.dispose();
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
  root.removeFromParent();
}
