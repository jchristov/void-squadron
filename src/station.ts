import * as THREE from 'three';

export interface AnimatedGroup extends THREE.Group {
  userData: THREE.Group['userData'] & { update?: (elapsed: number, dt: number) => void };
}

interface Blinker {
  target: THREE.Sprite | THREE.Mesh;
  period: number;
  phase: number;
  duty: number;
  /** Opacity / emissive intensity when dark and when lit. */
  off: number;
  on: number;
  /** Smooth pulse instead of hard on/off. */
  soft?: boolean;
}

let glowTexture: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,.75)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let next = Math.imul(t ^ (t >>> 15), t | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lit-window facade: dark hull with rows of warm and cool windows, used as both colour and emissive map. */
function createWindowTexture(seed: number, columns = 46, rows = 7): THREE.CanvasTexture {
  const width = 512;
  const height = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(seed);
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, width, height);
  const cellW = width / columns;
  const cellH = height / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const roll = random();
      if (roll < 0.34) continue;
      const warm = random() < 0.68;
      ctx.fillStyle = warm ? `rgba(255,${190 + Math.floor(random() * 50)},${110 + Math.floor(random() * 60)},${0.65 + random() * 0.35})` : `rgba(${120 + Math.floor(random() * 60)},232,255,${0.6 + random() * 0.4})`;
      ctx.fillRect(column * cellW + cellW * 0.2, row * cellH + cellH * 0.28, cellW * 0.6, cellH * 0.44);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPanelTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a1830';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(120,190,255,.55)';
  ctx.lineWidth = 2;
  for (let index = 0; index <= 4; index += 1) {
    ctx.beginPath();
    ctx.moveTo((index * size) / 4, 0);
    ctx.lineTo((index * size) / 4, size);
    ctx.moveTo(0, (index * size) / 4);
    ctx.lineTo(size, (index * size) / 4);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function metal(color: number, emissive = 0x000000, roughness = 0.42, metalness = 0.88): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness, metalness });
}

function emissiveStrip(color: number, intensity = 2.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x0a0e14, emissive: color, emissiveIntensity: intensity, roughness: 0.3, metalness: 0.2 });
}

function addBlinkLight(
  group: THREE.Object3D,
  blinkers: Blinker[],
  position: THREE.Vector3,
  color: number,
  size: number,
  options: { period?: number; phase?: number; duty?: number; soft?: boolean; steady?: boolean } = {},
): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.position.copy(position);
  sprite.scale.setScalar(size);
  group.add(sprite);
  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.07, 8, 6), new THREE.MeshBasicMaterial({ color }));
  core.position.copy(position);
  group.add(core);
  if (!options.steady) {
    blinkers.push({ target: sprite, period: options.period ?? 1.6, phase: options.phase ?? 0, duty: options.duty ?? 0.2, off: 0.05, on: 1, soft: options.soft });
  }
  return sprite;
}

function updateBlinkers(blinkers: Blinker[], elapsed: number): void {
  for (const blinker of blinkers) {
    const cycle = (elapsed / blinker.period + blinker.phase) % 1;
    let level: number;
    if (blinker.soft) level = blinker.off + (blinker.on - blinker.off) * (0.5 + 0.5 * Math.sin(cycle * Math.PI * 2));
    else level = cycle < blinker.duty ? blinker.on : blinker.off;
    const material = (blinker.target as THREE.Sprite).material as THREE.SpriteMaterial;
    material.opacity = level;
  }
}

/**
 * Orbital hangar station: spindle hub, rotating habitat ring with lit windows, solar arrays, antenna masts with
 * strobes and a glowing docking bell. Docking axis is +Z (toward the camera). Call `userData.update` each frame.
 */
export function createSpaceStation(): AnimatedGroup {
  const root = new THREE.Group() as AnimatedGroup;
  const blinkers: Blinker[] = [];
  const hull = metal(0x66748a);
  const dark = metal(0x2b3445, 0x000000, 0.55, 0.8);
  const plating = metal(0x8795ab, 0x000000, 0.38, 0.9);
  const cyanStrip = emissiveStrip(0x62d9ff, 2.6);
  const amberStrip = emissiveStrip(0xffb866, 2.4);

  // ---- hub spindle (axis = Z)
  const hub = new THREE.Group();
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 56, 28), hull);
  spindle.rotation.x = Math.PI / 2;
  hub.add(spindle);
  for (const z of [-20, -8, 5, 17]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 2.6, 28), plating);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = z;
    hub.add(collar);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(6.45, 0.16, 6, 48), cyanStrip);
    stripe.position.z = z + 1.35;
    hub.add(stripe);
  }
  // Aft: radiator fins and reactor glow
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 17), dark);
    fin.position.set(Math.cos(angle) * 8.5, Math.sin(angle) * 8.5, -24);
    fin.rotation.z = angle;
    hub.add(fin);
  }
  const reactor = new THREE.Mesh(new THREE.SphereGeometry(5.4, 20, 16), metal(0x384355));
  reactor.position.z = -30;
  hub.add(reactor);
  const reactorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x49d3ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  reactorGlow.scale.setScalar(26);
  reactorGlow.position.z = -33;
  hub.add(reactorGlow);
  blinkers.push({ target: reactorGlow, period: 5, phase: 0, duty: 1, off: 0.5, on: 0.95, soft: true });

  // ---- docking bell and hangar mouth (front)
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 5.2, 8, 32, 1, true), plating);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = 32;
  bell.material.side = THREE.DoubleSide;
  hub.add(bell);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(11.6, 0.9, 10, 48), dark);
  lip.position.z = 36;
  hub.add(lip);
  const mouthGlow = new THREE.Mesh(new THREE.CircleGeometry(10.2, 40), new THREE.MeshBasicMaterial({ color: 0xffa24a, transparent: true, opacity: 0.88 }));
  mouthGlow.position.z = 31.4;
  hub.add(mouthGlow);
  const mouthSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffb066, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  mouthSprite.scale.setScalar(30);
  mouthSprite.position.z = 37;
  hub.add(mouthSprite);
  blinkers.push({ target: mouthSprite, period: 7, phase: 0.2, duty: 1, off: 0.35, on: 0.65, soft: true });
  // Guidance chevrons: concentric lit rings that chase inward
  const chevrons: THREE.Mesh[] = [];
  for (let index = 0; index < 5; index += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.4 - index * 1.6, 0.22, 8, 40), emissiveStrip(index % 2 ? 0x62d9ff : 0xffb866, 2));
    ring.position.z = 33.4 - index * 0.7;
    chevrons.push(ring);
    hub.add(ring);
  }
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 4.4), dark);
    clamp.position.set(Math.cos(angle) * 11.9, Math.sin(angle) * 11.9, 34.2);
    clamp.rotation.z = angle;
    hub.add(clamp);
    addBlinkLight(hub, blinkers, new THREE.Vector3(Math.cos(angle) * 11.9, Math.sin(angle) * 11.9, 36.6), index % 2 ? 0x62d9ff : 0xffb866, 3.2, { period: 2.4, phase: index / 12, duty: 0.22 });
  }
  root.add(hub);

  // ---- rotating habitat ring
  const ring = new THREE.Group();
  const ringRadius = 34;
  const segments = 36;
  const windowMaterials = [createWindowTexture(11), createWindowTexture(23), createWindowTexture(37)].map((texture) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x4d5a70, map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.8, roughness: 0.5, metalness: 0.75 });
    return material;
  });
  const arc = (Math.PI * 2 * ringRadius) / segments;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const module = new THREE.Mesh(new THREE.BoxGeometry(5.6, arc * 0.96, 9), windowMaterials[index % windowMaterials.length]);
    module.position.set(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0);
    module.rotation.z = angle;
    ring.add(module);
    if (index % 4 === 0) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.1, 11.4), plating);
      buttress.position.copy(module.position);
      buttress.rotation.z = angle;
      ring.add(buttress);
    }
  }
  for (const z of [-5.2, 5.2]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(ringRadius + 2.9, 0.28, 6, 96), cyanStrip);
    rail.position.z = z;
    ring.add(rail);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(ringRadius - 2.9, 0.2, 6, 96), amberStrip);
    inner.position.z = z * 0.9;
    ring.add(inner);
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, ringRadius - 6, 10), hull);
    spoke.position.set(Math.cos(angle) * ((ringRadius + 6) / 2), Math.sin(angle) * ((ringRadius + 6) / 2), 0);
    spoke.rotation.z = angle - Math.PI / 2;
    ring.add(spoke);
  }
  // Running lights chase around the ring
  const runners: THREE.Sprite[] = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: index % 6 === 0 ? 0xff5d5d : 0x7ee6ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(4.2);
    sprite.position.set(Math.cos(angle) * (ringRadius + 3.2), Math.sin(angle) * (ringRadius + 3.2), 6.3);
    runners.push(sprite);
    ring.add(sprite);
  }
  root.add(ring);

  // ---- solar arrays on booms
  const panelTexture = createPanelTexture();
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1b3c78, map: panelTexture, emissive: 0x0b2a66, emissiveIntensity: 0.55, roughness: 0.28, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 78, 8), dark);
    boom.rotation.z = Math.PI / 2;
    boom.position.set(0, 0, -12);
    if (side === 1) root.add(boom);
    for (let index = 0; index < 4; index += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 22), panelMaterial);
      panel.position.set(side * (44 + index * 13.6), 0, -12);
      panel.rotation.x = 0.12;
      root.add(panel);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.35, 22.6), dark);
      frame.position.copy(panel.position);
      frame.position.y -= 0.12;
      frame.rotation.x = 0.12;
      root.add(frame);
    }
    addBlinkLight(root, blinkers, new THREE.Vector3(side * 98, 0.6, -12), side > 0 ? 0x4dff88 : 0xff4d4d, 5, { period: 2, phase: side > 0 ? 0 : 0.5, duty: 0.5 });
  }

  // ---- antenna masts and dishes
  const mastSpecs: Array<[number, number, number, number]> = [[-6, 28, -14, 24], [7, 24, 4, 18], [0, 34, 22, 14]];
  mastSpecs.forEach(([x, y, z, height], index) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, height, 8), hull);
    mast.position.set(x, y + height / 2 - 20, z);
    root.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), plating);
    dish.position.set(x, y + height * 0.62 - 20, z);
    dish.rotation.set(-0.6 + index * 0.25, index * 0.8, 0);
    root.add(dish);
    addBlinkLight(root, blinkers, new THREE.Vector3(x, y + height - 20 + 0.6, z), 0xff4040, 5.2, { period: 1.8 + index * 0.35, phase: index * 0.33, duty: 0.18 });
    addBlinkLight(root, blinkers, new THREE.Vector3(x, y + height * 0.5 - 20, z), 0xffffff, 3.2, { period: 1.1 + index * 0.2, phase: index * 0.17, duty: 0.07 });
  });

  // ---- docking pylons with parked craft lights
  const pylonAngles = [Math.PI * 1.12, Math.PI * 1.88, Math.PI * 0.42];
  pylonAngles.forEach((angle, index) => {
    const pylon = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 24), dark);
    arm.position.z = 12;
    const head = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 8), plating);
    head.position.z = 25;
    const bay = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.2, 6.4), amberStrip);
    bay.position.set(0, 0.7, 25);
    pylon.add(arm, head, bay);
    pylon.position.set(Math.cos(angle) * (ringRadius + 5.2), Math.sin(angle) * (ringRadius + 5.2), 4);
    root.add(pylon);
    addBlinkLight(root, blinkers, pylon.position.clone().add(new THREE.Vector3(3.8, 1.2, 25)), 0x4dff88, 3.4, { period: 1.7, phase: index * 0.31, duty: 0.4 });
    addBlinkLight(root, blinkers, pylon.position.clone().add(new THREE.Vector3(-3.8, 1.2, 25)), 0xff4d4d, 3.4, { period: 1.7, phase: index * 0.31 + 0.5, duty: 0.4 });
  });

  // ---- hub warm interior light
  const bayLight = new THREE.PointLight(0xffa04a, 60, 90, 1.6);
  bayLight.position.set(0, 0, 40);
  root.add(bayLight);

  root.userData.update = (elapsed: number, dt: number) => {
    ring.rotation.z += dt * 0.045;
    updateBlinkers(blinkers, elapsed);
    runners.forEach((sprite, index) => {
      const pulse = (elapsed * 0.7 - index / runners.length) % 1;
      (sprite.material as THREE.SpriteMaterial).opacity = 0.25 + 0.75 * Math.pow(1 - pulse, 3);
    });
    chevrons.forEach((chevron, index) => {
      const wave = (elapsed * 0.9 - index * 0.16) % 1;
      (chevron.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 3 * Math.pow(1 - wave, 2);
    });
    bayLight.intensity = 55 + Math.sin(elapsed * 1.7) * 8;
  };
  return root;
}

/** Foreground landing cradle under the preview craft: pad, clamp arms, gantry truss, chasing guide lights. */
export function createDockCradle(): AnimatedGroup {
  const root = new THREE.Group() as AnimatedGroup;
  const blinkers: Blinker[] = [];
  const hull = metal(0x4c586c);
  const dark = metal(0x252d3b, 0x000000, 0.55, 0.8);
  const plating = metal(0x8795ab, 0x000000, 0.36, 0.9);

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 9, 0.8, 48), plating);
  root.add(pad);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.2, 48), dark);
  deck.position.y = 0.46;
  root.add(deck);
  const rings: THREE.Mesh[] = [];
  for (const radius of [3.2, 5.2, 7.1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 6, 64), emissiveStrip(0x62d9ff, 2.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.62;
    rings.push(ring);
    root.add(ring);
  }
  const guideLights: THREE.Mesh[] = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.34), emissiveStrip(index % 4 === 0 ? 0xffb866 : 0x62d9ff, 1.4));
    light.position.set(Math.cos(angle) * 8.3, 0.52, Math.sin(angle) * 8.3);
    light.rotation.y = -angle;
    guideLights.push(light);
    root.add(light);
  }
  // Clamp arms
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.2), dark);
    base.position.set(side * 9.4, 0.8, 0);
    const column = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1.1), hull);
    column.position.set(side * 9.4, 5.2, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.7), plating);
    head.position.set(side * 7.9, 9.9, 0);
    head.rotation.z = side * 0.14;
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 1.3), dark);
    claw.position.set(side * 6.4, 8.9, 0);
    claw.rotation.z = side * 0.3;
    root.add(base, column, head, claw);
    const hint = new THREE.Mesh(new THREE.BoxGeometry(0.34, 6, 0.34), emissiveStrip(0xffb866, 2));
    hint.position.set(side * 8.84, 5.2, 0.62);
    root.add(hint);
    addBlinkLight(root, blinkers, new THREE.Vector3(side * 6.6, 10.6, 0), side > 0 ? 0x4dff88 : 0xff4d4d, 3.4, { period: 1.5, phase: side > 0 ? 0 : 0.5, duty: 0.4 });
  }
  // Gantry truss running down and away toward the lower-right corner
  const truss = new THREE.Group();
  const beamLength = 52;
  for (const offset of [-1.4, 1.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, beamLength), hull);
    rail.position.set(offset, offset > 0 ? 0 : 2.8, 0);
    truss.add(rail);
  }
  for (let index = 0; index < 22; index += 1) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4, 0.28), dark);
    brace.position.set(0, 1.4, -beamLength / 2 + index * 2.4 + 1);
    brace.rotation.x = index % 2 ? 0.62 : -0.62;
    truss.add(brace);
    if (index % 4 === 0) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.3), dark);
      frame.position.set(0, 1.4, -beamLength / 2 + index * 2.4 + 1);
      truss.add(frame);
    }
  }
  truss.position.set(10.5, -3.2, 20);
  truss.rotation.set(0.18, -0.3, 0.1);
  root.add(truss);
  for (let index = 0; index < 5; index += 1) {
    addBlinkLight(root, blinkers, new THREE.Vector3(10.5 + index * 3.2, -2.4 - index * 0.5, 5 + index * 9), index % 2 ? 0xff4d4d : 0xffb866, 3, { period: 2.2, phase: index * 0.2, duty: 0.3 });
  }
  // Guide beam
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 7.6, 7.5, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x62d9ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.y = 4.4;
  root.add(beam);
  const padLight = new THREE.PointLight(0x62d9ff, 28, 36, 1.7);
  padLight.position.set(0, 3.2, 0);
  root.add(padLight);

  root.userData.update = (elapsed: number) => {
    updateBlinkers(blinkers, elapsed);
    rings.forEach((ring, index) => {
      (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + 2.6 * Math.pow(0.5 + 0.5 * Math.sin(elapsed * 2.4 - index * 1.2), 2);
    });
    guideLights.forEach((light, index) => {
      const wave = (elapsed * 0.8 - index / guideLights.length) % 1;
      (light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + 3.4 * Math.pow(1 - wave, 4);
    });
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.03 + 0.025 * (0.5 + 0.5 * Math.sin(elapsed * 1.3));
    padLight.intensity = 11 + Math.sin(elapsed * 2.1) * 3;
  };
  return root;
}
