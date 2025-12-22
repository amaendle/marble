// marble_arena_prototype.js

import * as THREE from 'https://unpkg.com/three@0.174.0/build/three.module.js';
import {
  OrbitControls
} from 'https://unpkg.com/three@0.174.0/examples/jsm/controls/OrbitControls';
import * as CANNON from 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';
import * as BufferGeometryUtils from 'https://unpkg.com/three@0.174.0/examples/jsm/utils/BufferGeometryUtils.js';
import { Water } from 'https://unpkg.com/three@0.174.0/examples/jsm/objects/Water.js';
import CannonDebugger from 'https://cdn.skypack.dev/cannon-es-debugger';

// load music
const listener = new THREE.AudioListener();
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('https://upload.wikimedia.org/wikipedia/commons/9/96/Mendelssohn_-_Hebrides_Overture_Fingal%27s_Cave.ogg', (buffer) => {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);
  sound.play();
});

    let scene, camera, renderer, controls, water;
    let marble, marbleBody, world;
    let cpuMarbles = [], cpuBodies = [];
	const cpuColors = [0x3333ff, 0x33ff33, 0xffff33];
    const cpuBehaviors = ['aggressive','evasive','chaotic']; //['idle','idle', 'chaotic'];//
    let groundBody;
    let keys = {};
    let marbleLives = 0;
    let cpuLives = [0, 0, 0];
    let maxlives = 3;
    let health = { player: 100, cpu: [100, 100, 100] };
    const ENABLE_KNOCKBACK = true;
    let playerJumpCooldown = 0;
    const cpuJumpCooldown = [0, 0, 0];
    let projectiles = [];
    let playerIsDashing = false;
    const cpuIsDashing = [false, false, false];
    let playerShieldActive = false;
    let playerShieldTimer = 0;
    let playerDashCooldown = 0;
    const CAMERA_FOLLOW_PLAYER = false;
    let lastInputDirection = new CANNON.Vec3(0, 0, 1); // default forward
const pitMeshes = [];
const tileSize = 5;

let animationId = null;
let matchOver = false;
let wireframeEnabled = false;
let waterEnabled = true;
let cannonDebugObjects = [];
let mobileControlsInitialized = false;
const DEBUG_MODE = true;
let wireframeToggleButton = null;
let waterToggleButton = null;
let preDebuggerObjects;

function refreshCannonDebugObjects() {
  if (!scene || !preDebuggerObjects) return;
  cannonDebugObjects = scene.children.filter((child) => !preDebuggerObjects.has(child));
}

function applyWireframeToMaterial(material, enabled) {
  if (!material || typeof material !== 'object') return;
  if (Array.isArray(material)) {
    material.forEach((mat) => applyWireframeToMaterial(mat, enabled));
    return;
  }
  if ('wireframe' in material) {
    material.wireframe = enabled;
    material.needsUpdate = true;
  }
}

function applyWireframeToScene(enabled) {
  if (!scene) return;
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    applyWireframeToMaterial(obj.material, enabled);
  });
}

function setWireframeMode(enabled) {
  wireframeEnabled = enabled;
  if (enabled && cannonDebugger?.update) {
    cannonDebugger.update();
    refreshCannonDebugObjects();
  }
  applyWireframeToScene(enabled);
  cannonDebugObjects.forEach((obj) => {
    obj.visible = enabled;
  });
  if (wireframeToggleButton) {
    wireframeToggleButton.textContent = `Wireframe: ${enabled ? 'On' : 'Off'}`;
  }
}

function setWaterVisible(enabled) {
  waterEnabled = enabled;
  if (water) {
    water.visible = enabled;
  }
  if (waterToggleButton) {
    waterToggleButton.textContent = `Water: ${enabled ? 'On' : 'Off'}`;
  }
}


  const arenaScaling = 5;
  const arenaRadius = arenaScaling*4.1;
const wallHeightUnit = arenaScaling*0.4;
//const outerRadius = arenaRadius + arenaScaling*0.4;
//const innerRadius = arenaRadius - arenaScaling*0.01;
const wallSegments = 16;

    init();

preDebuggerObjects = new Set(scene.children);
const cannonDebugger = CannonDebugger(scene, world, {
  color: 0xff00ff,
});
refreshCannonDebugObjects();
setWireframeMode(false);

    // Joystick fallback for tilt control
    if (isMobileDevice()) {
      const indicator = document.getElementById('tilt-indicator');
      let rect, centerX, centerY;
      window.joystickVector = { x: 0, z: 0 };
      window.joystickActive = false;

      const updateJoystick = (e) => {
        const touch = e.touches[0];
        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const maxRange = 40; // pixels
        const normX = Math.max(-1, Math.min(1, dx / maxRange));
        const normZ = Math.max(-1, Math.min(1, dy / maxRange));
        window.joystickVector = { x: normX * 1, z: normZ * 1 };
        window.joystickActive = true;
      };

      indicator.addEventListener('touchstart', (e) => {
        rect = indicator.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        updateJoystick(e);
      });
      indicator.addEventListener('touchmove', updateJoystick);
      indicator.addEventListener('touchend', () => {
        window.joystickActive = false;
        window.joystickVector = { x: 0, z: 0 };
      });
    }

    let tiltForce = { x: 0, z: 0 };
    function isMobileDevice() {
      //return /Mobi|Android/i.test(navigator.userAgent);
      return navigator.maxTouchPoints > 0;
    }

  function setupProjectileSystem() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f') keys['f'] = true;
    });
  }

  function createExplosion(position, color = 0xffaa00) {
    const geometry = new THREE.SphereGeometry(0.1, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });

    for (let i = 0; i < 12; i++) {
      const particle = new THREE.Mesh(geometry, material.clone());
      particle.position.copy(position);
      scene.add(particle);

      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.5,
        Math.random() - 0.5
      ).normalize();

      const speed = 0.2 + Math.random() * 0.2;
      let age = 0;
      const lifetime = 500;

      const animateParticle = () => {
        if (!scene.children.includes(particle)) return;
        particle.position.addScaledVector(dir, speed);
        particle.material.opacity -= 0.02;
        age += 16;
        if (age >= lifetime || particle.material.opacity <= 0) {
          scene.remove(particle);
          return;
        }
        requestAnimationFrame(animateParticle);
      };

      animateParticle();
    }
  }

  function fireProjectile() {
    const radius = 0.3;
    const speed = 20;
    const geometry = new THREE.SphereGeometry(radius, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    const mesh = new THREE.Mesh(geometry, material);
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({ mass: 0.02, shape });
    
    const fire_direction = lastInputDirection.clone();
    fire_direction.normalize();
    
    const  projectileOffset = fire_direction.clone().scale(1.2+0.5); // slightly in front
    const spawnPosition = marbleBody.position.vadd(projectileOffset);
    body.position.copy(spawnPosition);
    mesh.position.copy(spawnPosition);
    
    scene.add(mesh);

    body.velocity.set(spawnPosition.x * speed, 0, spawnPosition.z * speed);
    body.velocity.set(fire_direction.x * speed, 0, fire_direction.z * speed);

    world.addBody(body);
    projectiles.push({ body, mesh, age: 0 });
  }

    function getScreenOrientationAngle() {
      if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
        return screen.orientation.angle;
      }
      if (typeof window.orientation === 'number') {
        return window.orientation;
      }
      return 0;
    }

    function handleOrientation(event) {
      const maxTilt = 30;
      const scale = 1; //10 / maxTilt;

      const normX = Math.max(-1, Math.min(1, event.gamma / maxTilt)) * scale;
      const normZ = Math.max(-1, Math.min(1, event.beta / maxTilt)) * scale;

      // Rotate tilt vector to keep controls aligned across orientations (portrait & both landscapes)
      const orientation = ((getScreenOrientationAngle() % 360) + 360) % 360;
      const angle = (-orientation * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      tiltForce.x = normX * cos - normZ * sin;
      tiltForce.z = normX * sin + normZ * cos;
    }

    if (isMobileDevice()) {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        }).catch(console.error);
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }

    function toggleFullscreen() {
      const elem = document.documentElement;
      const request = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen;
      if (!document.fullscreenElement && request) {
        request.call(elem);
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }

    function updateFullscreenLabels() {
      document.querySelectorAll('#btn-fullscreen').forEach((btn) => {
        btn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
      });
    }

    function attachFullscreenHandlers(button) {
      if (!button || button.dataset.fullscreenBound) return;
      const handler = (e) => { e.preventDefault(); toggleFullscreen(); };
      button.addEventListener('click', handler, { passive: false });
      button.dataset.fullscreenBound = 'true';
      updateFullscreenLabels();
    }

    document.addEventListener('fullscreenchange', updateFullscreenLabels);

    function setupMobileControls() {
      if (mobileControlsInitialized) return;
      mobileControlsInitialized = true;

      const mobileUi = document.getElementById('mobile-ui');
      if (mobileUi) mobileUi.style.display = 'flex';

      const btnDash = document.getElementById('btn-dash');
      const btnJump = document.getElementById('btn-jump');
      const btnFullscreen = document.getElementById('btn-fullscreen');
      const btnFire = document.getElementById('btn-fire');

      if (btnDash) {
        btnDash.addEventListener('touchstart', () => {
          keys[' '] = true;
          if (navigator.vibrate) navigator.vibrate([300]);
        });
        btnDash.addEventListener('touchend', () => keys[' '] = false);
      }

      if (btnJump) {
        btnJump.addEventListener('touchstart', () => {
          keys['Shift'] = true;
          if (navigator.vibrate) navigator.vibrate([200]);
        });
        btnJump.addEventListener('touchend', () => keys['Shift'] = false);
      }

      if (btnFire) {
        btnFire.addEventListener('touchstart', () => {
          fireProjectile();
          if (navigator.vibrate) navigator.vibrate(15);
        });
      }
      attachFullscreenHandlers(btnFullscreen);
    }

    function setupDebugControls() {
      wireframeToggleButton = document.getElementById('btn-wireframe');
      waterToggleButton = document.getElementById('btn-water-toggle');

      const fullscreenButton = document.getElementById('btn-fullscreen');

      if (wireframeToggleButton) {
        wireframeToggleButton.addEventListener('click', () => setWireframeMode(!wireframeEnabled));
        wireframeToggleButton.textContent = `Wireframe: ${wireframeEnabled ? 'On' : 'Off'}`;
      }

      if (waterToggleButton) {
        waterToggleButton.addEventListener('click', () => setWaterVisible(!waterEnabled));
        waterToggleButton.textContent = `Water: ${waterEnabled ? 'On' : 'Off'}`;
      }

      if (fullscreenButton && DEBUG_MODE) {
        fullscreenButton.style.display = 'inline-block';
      }

      attachFullscreenHandlers(fullscreenButton);

      if (DEBUG_MODE) {
        const debugControls = document.getElementById('debug-controls');
        if (debugControls) {
          debugControls.style.display = 'flex';
        }
      }
    }

    if (isMobileDevice()) {
      setupMobileControls();
    }

    window.addEventListener('touchstart', () => setupMobileControls(), { once: true });
    setupCollisionDetection();
    setupProjectileSystem();
    setupDebugControls();
    animate();

    function createDashEffect(position, color = 0xffffff) {
  const geometry = new THREE.SphereGeometry(0.15, 4, 4);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 12; i++) {
    const particle = new THREE.Mesh(geometry, material.clone());
    particle.position.copy(position);
    scene.add(particle);
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const speed = 0.15 + Math.random() * 0.2;
    let age = 0;
    const lifetime = 300;
    const animateParticle = () => {
      if (!scene.children.includes(particle)) return;
      particle.position.addScaledVector(dir, speed);
      particle.material.opacity -= 0.02;
      age += 16;
      if (age >= lifetime || particle.material.opacity <= 0) {
        scene.remove(particle);
        return;
      }
      requestAnimationFrame(animateParticle);
    };
    animateParticle();
  }

  // Add trail glow ring
  const ringGeometry = new THREE.RingGeometry(0.8, 1.2, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  scene.add(ring);
  let ringAge = 0;
  const animateRing = () => {
    if (!scene.children.includes(ring)) return;
    ring.material.opacity -= 0.02;
    ring.scale.multiplyScalar(1.02);
    ringAge += 16;
    if (ringAge > 400 || ring.material.opacity <= 0) {
      scene.remove(ring);
      return;
    }
    requestAnimationFrame(animateRing);
  };
  animateRing();
}

function createFallParticles(position, color = 0xffffff) {
  const geometry = new THREE.SphereGeometry(0.1, 4, 4);
  const material = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 10; i++) {
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    particle.position.x += (Math.random() - 0.5) * 2;
    particle.position.y += (Math.random() - 0.5) * 2;
    particle.position.z += (Math.random() - 0.5) * 2;
    scene.add(particle);
    const direction = new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.5),
      (Math.random() - 0.5)
    ).normalize();
    const speed = Math.random() * 0.1;
    setTimeout(() => scene.remove(particle), 1000);
    const animateParticle = () => {
      particle.position.addScaledVector(direction, speed);
      if (scene.children.includes(particle)) {
        requestAnimationFrame(animateParticle);
      }
    };
    animateParticle();
  }
}

function respawn(body, x = 0, z = 0) {
      body.velocity.setZero();
      body.angularVelocity.setZero();
      body.position.set(x, 5, z);
    }

function init_powerups() {
    // Powerups
  const powerupGeometry = new THREE.SphereGeometry(0.5, 8, 8);
  const shieldMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff });
  const shieldPickup = new THREE.Mesh(powerupGeometry, shieldMaterial);
  shieldPickup.position.set(10, 1, 10);
  scene.add(shieldPickup);

  const shieldShape = new CANNON.Sphere(0.5);
  const shieldBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: shieldShape, position: new CANNON.Vec3(10, 1, 10) });
  world.addBody(shieldBody);

  shieldPickup.userData.body = shieldBody;
  shieldPickup.userData.type = 'shield';
  shieldPickup.userData.active = true;

  scene.userData.powerups = [shieldPickup];
}

function init() {  
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa0d8f0);
  scene.fog = new THREE.FogExp2(0xb0c4de, 0.02);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.add(listener);
  camera.position.set(0, 100, 20);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(scene.fog.color);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
 // const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.minPolarAngle = 0;                  // you may look straight down
controls.maxPolarAngle = Math.PI * 0.5;      // …but never past the horizon
controls.minDistance   =  2;  // stay at least 2 units away from target
controls.maxDistance   = 80;  // don’t zoom out too far
//controls.screenSpacePanning = false; // pan parallel to world-XY instead of sreen plane 
controls.enablePan           = false;
controls.update();
// --- keep only the vertical part of every pan ----------------------------
const arenaCentre = new THREE.Vector3(0, 0, 0);

controls.addEventListener( 'change', () => {
    // keep the orbit centre on or above y = 0
    if ( controls.target.y < 0 ) {
        const delta = -controls.target.y;      // how far we are below sea
        controls.target.y = 0;
        camera.position.y += delta;            // lift the camera the same amount
    }
} );

  const ambientLight = scene.add(new THREE.AmbientLight(0xcccccc, 0.4));
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 50, 0);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 512;
  directionalLight.shadow.mapSize.height = 512;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  scene.add(directionalLight);
  
  // Water
const waterNormals = new THREE.TextureLoader().load(
  'https://threejs.org/examples/textures/waternormals.jpg',
  texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
);

const waterGeometry = new THREE.PlaneGeometry(30*arenaScaling, 30*arenaScaling);

water = new Water(waterGeometry, {
  textureWidth: 1024,
  textureHeight: 1024,
  waterNormals: waterNormals,
  sunDirection: directionalLight.position.clone().normalize(),
  sunColor: 0xffffff,
  waterColor: 0x1e90ff,
  distortionScale: 4,
  fog: scene.fog !== undefined
});

water.rotation.x = -Math.PI / 2;
water.position.y = -0.05;

scene.add(water);
setWaterVisible(true);
//--------------------------------------------------------------------
// FOAM / Gischt an Mauerkanten --------------------------------------
//--------------------------------------------------------------------
// Lade eine transparente PNG mit weißer/heller Schaumkrone und alpha.
// Lege sie in einen Unterordner "textures" oder passe den Pfad an.
// (nur die Zeile tauschen)
/*const foamURL = 'https://opengameart.org/sites/default/files/oga-textures/38304/foam.png';
const foamTex = new THREE.TextureLoader()
  .setCrossOrigin('anonymous')      // ← ohne CORS-Header würde der Browser blocken
  .load(foamURL, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 1);             // Breite/Tile-Faktor beliebig ändern
  });



const foamMatBase = new THREE.MeshBasicMaterial({
  map: foamTex,
  transparent: true,
  depthWrite: false,
  opacity: 0.85,
  side: THREE.DoubleSide
});

// Utility für einzelne Streifen
function createFoamStrip(width, height, pos, rotAxisY = false) {
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = foamMatBase.clone();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;          // flach auf Wasser­ebene
  if (rotAxisY) mesh.rotation.z = Math.PI / 2; // für Ost/West drehen
  mesh.position.copy(pos);
  return mesh;
}

const foamThickness = 1.2;
const foamY = 0.03; // leicht über Wasseroberfläche

const foamNorth = createFoamStrip(30, foamThickness, new THREE.Vector3(0, foamY, -15 + foamThickness / 2));
const foamSouth = createFoamStrip(30, foamThickness, new THREE.Vector3(0, foamY,  15 - foamThickness / 2));
const foamEast  = createFoamStrip(30, foamThickness, new THREE.Vector3( 15 - foamThickness / 2, foamY, 0), true);
const foamWest  = createFoamStrip(30, foamThickness, new THREE.Vector3(-15 + foamThickness / 2, foamY, 0), true);

const foamStrips = [foamNorth, foamSouth, foamEast, foamWest];
foamStrips.forEach(strip => scene.add(strip));
*/

  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

  // Replace full ground with tiled grid that avoids pits
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228822 });
 // const tileSize = 5;
  const halfSize = 30;
  const pitRadius = 2;
  const PIT_COUNT = 3;
  const pitPositions = [];
  
const PLATFORM_COUNT = 3;
  //. Pre-generate platform positions on tile grid
const platformTileKeys = new Set();

  // Precompute pit positions on tile grid
  const pitTileKeys = new Set();
  for (let i = 0; i < PIT_COUNT; i++) {
    const gridX = Math.floor(Math.random() * (halfSize * 2 / tileSize)) - (halfSize / tileSize);
    const gridZ = Math.floor(Math.random() * (halfSize * 2 / tileSize)) - (halfSize / tileSize);
    const px = gridX * tileSize + tileSize / 2;
    const pz = gridZ * tileSize + tileSize / 2;
    pitPositions.push({ x: px, z: pz });
    pitTileKeys.add(`${px}_${pz}`);

    const pitMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const pitGeo = new THREE.CylinderGeometry(pitRadius, pitRadius, 0.2, 32);
    const pitMesh = new THREE.Mesh(pitGeo, pitMaterial);
    pitMesh.position.set(px, 2*wallHeightUnit + 0-0.05-0.1, pz);
    pitMesh.material.emissive = new THREE.Color(0x222222);
    pitMesh.material.emissiveIntensity = 1;
    pitMesh.material.transparent = true;
    pitMesh.material.opacity = 0.9;
    const ringGeometry = new THREE.TorusGeometry(pitRadius + 0.1, 0.2, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x111111 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(px, 2*wallHeightUnit + 0-0.05+ 0.11, pz);
    ring.material.transparent = true;
    ring.material.opacity = 0.7;
    scene.add(ring);
    pitMesh.userData.ring = ring;
    pitMeshes.push(pitMesh);
    scene.add(pitMesh);
  }
  
  //platform stuff again
  while (platformTileKeys.size < PLATFORM_COUNT) {
    const gridX = Math.floor(Math.random() * (halfSize * 2 / tileSize)) - (halfSize / tileSize);
    const gridZ = Math.floor(Math.random() * (halfSize * 2 / tileSize)) - (halfSize / tileSize);
    const px = gridX * tileSize + tileSize / 2;
    const pz = gridZ * tileSize + tileSize / 2;
    const key = `${px}_${pz}`;
    if (!pitTileKeys.has(key)) platformTileKeys.add(key);
  }

  for (let x = -halfSize; x < halfSize; x += tileSize) {
    for (let z = -halfSize; z < halfSize; z += tileSize) {
      const tileCenter = { x: x + tileSize / 2, z: z + tileSize / 2 };
      const overlapsPit = pitPositions.some(p => {
        const dx = p.x - tileCenter.x;
        const dz = p.z - tileCenter.z;
        return Math.sqrt(dx * dx + dz * dz) < pitRadius + tileSize / 2;
      });
      const key = `${tileCenter.x}_${tileCenter.z}`;
      if (pitTileKeys.has(key)) {
        // Custom pit tile with hole
        const shape = new THREE.Shape();
        const s = tileSize / 2;
        shape.moveTo(-s, -s);
        shape.lineTo(s, -s);
        shape.lineTo(s, s);
        shape.lineTo(-s, s);
        shape.lineTo(-s, -s);
        const hole = new THREE.Path();
        hole.absarc(0, 0, pitRadius + 0.1, 0, Math.PI * 2);
        shape.holes.push(hole);
        const geo = new THREE.ShapeGeometry(shape);
        const tileMesh = new THREE.Mesh(geo, groundMaterial);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.position.set(tileCenter.x, 2*wallHeightUnit + 0-0.05+ 0.01, tileCenter.z);
        tileMesh.receiveShadow = true;
        scene.add(tileMesh);

        const pitMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const pitGeo = new THREE.CylinderGeometry(pitRadius, pitRadius, 0.2, 32);
        const pitMesh = new THREE.Mesh(pitGeo, pitMaterial);
        pitMesh.position.set(tileCenter.x, 2*wallHeightUnit + 0-0.05 -0.1, tileCenter.z);
        pitMesh.material.emissive = new THREE.Color(0x222222);
        pitMesh.material.emissiveIntensity = 1;
        pitMesh.material.transparent = true;
        pitMesh.material.opacity = 0.9;
        scene.add(pitMesh);

        const ringGeometry = new THREE.TorusGeometry(pitRadius + 0.1, 0.2, 16, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x111111 });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(tileCenter.x, 2*wallHeightUnit + 0-0.05 + 0.11, tileCenter.z);
        ring.material.transparent = true;
        ring.material.opacity = 0.7;
        pitMesh.userData.ring = ring;
        pitMeshes.push(pitMesh);
        scene.add(ring);
        scene.add(pitMesh);
      } else if (platformTileKeys.has(key)) {
        // ❌ Do NOT draw any tile here — skip it
        // ✅ We'll add the raised platform later
      } else {
// no old fashined floor tiles
      }
    }
  }
  
  // Powerups
  init_powerups()

  // Hexagonal Walls
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const wallHeight = 2;
  const wallThickness = 1;
  const radius = 25;
  const sides = 6;

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * 2 * Math.PI;
    const nextAngle = ((i + 1) / sides) * 2 * Math.PI;
    const x = Math.cos((angle + nextAngle) / 2) * radius;
    const z = Math.sin((angle + nextAngle) / 2) * radius;
    const dx = Math.cos(nextAngle) - Math.cos(angle);
    const dz = Math.sin(nextAngle) - Math.sin(angle);
    const length = Math.sqrt(dx * dx + dz * dz) * radius;
    const rotationY = Math.atan2(dz, dx);

    const wallGeometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.set(x, wallHeight / 2, z);
    wallMesh.rotation.y = rotationY;
    scene.add(wallMesh);

    const wallShape = new CANNON.Box(new CANNON.Vec3(length / 2, wallHeight / 2, wallThickness / 2));
    const wallBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: wallShape });
    wallBody.position.set(x, wallHeight / 2, z);
    wallBody.quaternion.setFromEuler(0, rotationY, 0);
    world.addBody(wallBody);
  }

  // Bumps
  const bumpMaterial = new THREE.MeshStandardMaterial({ color: 0x996633 });
  for (let i = 0; i < 6; i++) {
    const bumpGeo = new THREE.CylinderGeometry(1, 1, 0.5, 16);
    const bumpMesh = new THREE.Mesh(bumpGeo, bumpMaterial);
    const bx = Math.random() * 40 - 20;
    const bz = Math.random() * 40 - 20;
    bumpMesh.position.set(bx, 2*wallHeightUnit + 0-0.05 + 0.25, bz);
    scene.add(bumpMesh);

    const bumpShape = new CANNON.Cylinder(1, 1, 0.5, 16);
    const bumpBody = new CANNON.Body({ type: CANNON.Body.STATIC });
    bumpBody.addShape(bumpShape);
    bumpBody.position.set(bx, 2*wallHeightUnit + 0-0.05 + 0.25, bz);
    world.addBody(bumpBody);
  }

  // Platforms
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x3366ff });
  
  platformTileKeys.forEach((key) => {
  const [px, pz] = key.split('_').map(Number);
  const platGeo = new THREE.BoxGeometry(tileSize, 0.5, tileSize);
  const platMesh = new THREE.Mesh(platGeo, platformMaterial);
  platMesh.position.set(px, 2*wallHeightUnit + 0-0.05 + 0.25, pz); // same top height as tile (0.5 high)
  platMesh.userData.startY = 2*wallHeightUnit + 0-0.05 + 0.25; // set y position here!!!!!!!!!!!!!1
  platMesh.userData.velocity = 0;
  scene.add(platMesh);

  const platShape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, 0.25, tileSize / 2));
  const platBody = new CANNON.Body({ type: CANNON.Body.STATIC });
  platBody.addShape(platShape);
  platBody.position.set(px, 2*wallHeightUnit + 0-0.05 + 0.25, pz);
  world.addBody(platBody);

  platMesh.userData.body = platBody;
  platMesh.userData.occupied = false;
  scene.userData.platforms = scene.userData.platforms || [];
  scene.userData.platforms.push(platMesh);
});
  
  ///////////////
// P solid wall, Q empty, G gate top
// .empty with arch??; T torch über empty
// L ledge at wrong position
const wallLayout = [
  '.....LLLTLTLTLTT',
  '....LGGGLPLPLGLL',
  'L..LPQPQPPPPPQPQ',
  'P..GPPPPGPPPPPGP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPP'
];

  function addCurvedGatePhysics(world, startAngle, endAngle, arenaRadius, wallHeight, wallThickness, segments = 16, y=0) {
  const thetaLength = endAngle - startAngle;
      const tunnelRadius = wallHeight;
  const tunnelCenterAngle = (startAngle + endAngle) / 2;

  for (let i = 0; i < segments; i++) {
    const a1 = startAngle + (i / segments) * thetaLength;
    const a2 = startAngle + ((i + 1) / segments) * thetaLength;

    const rInner = arenaRadius;// - wallThickness / 2;
    const rOuter = arenaRadius + wallThickness;// / 2;
    
        // tunnel cutout adjustment
    const yOffset = (angle) => {
      const cosArg = (angle - tunnelCenterAngle) * (arenaRadius / tunnelRadius);
      if (cosArg < -1 || cosArg > 1) return 0;
      return Math.sin(Math.acos(cosArg)) * tunnelRadius;
    };
    
    const x1Inner = Math.cos(a1) * rInner;
    const z1Inner = Math.sin(a1) * rInner;
    const y1Inner = yOffset(a1);

    const x2Inner = Math.cos(a2) * rInner;
    const z2Inner = Math.sin(a2) * rInner;
    const y2Inner = yOffset(a2);

    const x1Outer = Math.cos(a1) * rOuter;
    const z1Outer = Math.sin(a1) * rOuter;

    const x2Outer = Math.cos(a2) * rOuter;
    const z2Outer = Math.sin(a2) * rOuter;

      const shape = new CANNON.ConvexPolyhedron({
      vertices: [
        new CANNON.Vec3(x1Inner, y1Inner, z1Inner),
        new CANNON.Vec3(x2Inner, y2Inner, z2Inner),
        new CANNON.Vec3(x2Outer, y2Inner, z2Outer),
        new CANNON.Vec3(x1Outer, y1Inner, z1Outer),
        new CANNON.Vec3(x1Inner, wallHeight, z1Inner),
        new CANNON.Vec3(x2Inner, wallHeight, z2Inner),
        new CANNON.Vec3(x2Outer, wallHeight, z2Outer),
        new CANNON.Vec3(x1Outer, wallHeight, z1Outer),
      ],
      faces: [
        [0, 1, 2, 3], // bottom
        [4, 5, 6, 7], // top
        [0, 4, 5, 1],
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0],
      ]
    });

    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(0,y,0);
    world.addBody(body);
  }
}

function createCurvedGateTile({
  arenaRadius = 1,
  wallHeight = 0.4,
  wallThickness = 0.1,
  segmentCount = 16,
  heightSegments = 1,
  startAngle = Math.PI / 2 - (1 / 16) * Math.PI * 2 / 2,
  endAngle = Math.PI / 2 + (1 / 16) * Math.PI * 2 / 2,
  ypos = 0
} = {}) {
  const angleSegments = segmentCount;
  const heightSteps = heightSegments;
  const thetaLength = endAngle - startAngle;
  const uscale = 4*thetaLength/((1 / angleSegments) * Math.PI * 2);
  //const radiusInner = innerRadius;
  //const radiusOuter = outerRadius;
  const radiusInner = arenaRadius - 0*wallThickness;
  const radiusOuter = arenaRadius + 1*wallThickness;

  const vertices = [];
  const uvs = [];
  const indices = [];

  let indexOffset = 0;

  // Arc bottom +  Cutout (semi-circle from ground up)
  const holeRadius = wallHeight;
  const centerAngle = startAngle + 0.5 * thetaLength;
  const holeCenterX = centerAngle;
  const holeCenterY = 0.0;// 0.01; // slight lift to avoid exact overlap
  
  // --- FRONT AND BACK WALL FACES ---
  for (let iy = 0; iy <= heightSteps; iy++) {
    const v = iy / heightSteps;
    //const y = v * wallHeight;
    var y;
    for (let ix = 0; ix <= angleSegments; ix++) {
      const u = ix / angleSegments;
      const angle = startAngle + u * thetaLength;
      var vscale=1;
      if (false) { //if (u * thetaLength < holeCenterX -0.2*holeRadius || u * thetaLength > holeCenterX + 0.2*holeRadius) {
        y = v * wallHeight;
        vscale=1;
      } else {
        y = v * wallHeight;
        vscale=y;
        var yold = y;
        const cosArg = (angle - holeCenterX) * (arenaRadius / holeRadius);
        var a = Math.acos(cosArg);
        var ymin = Math.sin(a) * holeRadius; //1 * wallHeight; 
        if (y<ymin) {
          y = ymin;
        }

      }

      const xOuter = Math.cos(angle) * radiusOuter;
      const zOuter = Math.sin(angle) * radiusOuter;
      const xInner = Math.cos(angle) * radiusInner;
      const zInner = Math.sin(angle) * radiusInner;

      // Outer wall vertex
      vertices.push(xOuter, y, zOuter);
      uvs.push(0.25 * u * uscale, 0.25 * (y / wallHeight));

      // Inner wall vertex
      vertices.push(xInner, y, zInner);
      uvs.push(0.25 * u * uscale, 0.25 * (y / wallHeight));
    }
  }

  const vertsPerRow = (angleSegments + 1) * 2;

  for (let iy = 0; iy < heightSteps; iy++) {
    for (let ix = 0; ix < angleSegments; ix++) {
      const a = iy * vertsPerRow + ix * 2;
      const b = a + vertsPerRow;
      const c = b + 2;
      const d = a + 2;

      // Outer face
      indices.push(a, b, d);
      indices.push(b, c, d);

      // Inner face
      indices.push(a + 1, d + 1, b + 1);
      indices.push(b + 1, d + 1, c + 1);
    }
  }

  indexOffset = vertices.length / 3;

  // --- LEFT + RIGHT SIDE WALLS ---
  for (let side = 0; side <= 1; side++) {
    const angle = side === 0 ? startAngle : endAngle;
    const u = side; // 0 or 1

    for (let iy = 0; iy <= heightSteps; iy++) {
      const v = iy / heightSteps;
      const y = v * wallHeight;

      const xOuter = Math.cos(angle) * radiusOuter;
      const zOuter = Math.sin(angle) * radiusOuter;
      const xInner = Math.cos(angle) * radiusInner;
      const zInner = Math.sin(angle) * radiusInner;

      vertices.push(xInner, y, zInner);
      uvs.push(0, 0.25*v);

      vertices.push(xOuter, y, zOuter);
      uvs.push(1, 0.25*v);
    }

    for (let iy = 0; iy < heightSteps; iy++) {
      const a = indexOffset + iy * 2;
      const b = a + 2;
      const c = a + 1;
      const d = b + 1;

      if (!side) {
      indices.push(a, b, c);
      indices.push(b, d, c);
      } else {
      indices.push(b, a, c);
      indices.push(d, b, c);
      }
      
    }

    indexOffset += (heightSteps + 1) * 2;
  }

  // --- TOP SURFACE ---
  for (let ix = 0; ix <= angleSegments; ix++) {
    const u = ix / angleSegments;
    const angle = startAngle + u * thetaLength;

    const xOuter = Math.cos(angle) * radiusOuter;
    const zOuter = Math.sin(angle) * radiusOuter;
    const xInner = Math.cos(angle) * radiusInner;
    const zInner = Math.sin(angle) * radiusInner;

    vertices.push(xInner, wallHeight, zInner);
    uvs.push(0.25*u*uscale, 0);

    vertices.push(xOuter, wallHeight, zOuter);
    uvs.push(0.25*u*uscale, 1*0.25);
  }

  for (let ix = 0; ix < angleSegments; ix++) {
    const a = indexOffset + ix * 2;
    const b = a + 2;
    const c = a + 1;
    const d = b + 1;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  indexOffset += (angleSegments + 1) * 2;

  // --- BOTTOM SURFACE ---
  for (let ix = 0; ix <= angleSegments; ix++) {
    const u = ix / angleSegments;
    const angle = startAngle + u * thetaLength;

    const xOuter = Math.cos(angle) * radiusOuter;
    const zOuter = Math.sin(angle) * radiusOuter;
    const xInner = Math.cos(angle) * radiusInner;
    const zInner = Math.sin(angle) * radiusInner;
    
    // y correction for arch
    var y = 0;
    var yold = y;
    const cosArg = (angle - holeCenterX) * (arenaRadius / holeRadius);
    var a = Math.acos(cosArg);
    var ymin = Math.sin(a) * holeRadius; //1 * wallHeight; 
    if (y<ymin) {
      y = ymin;
    }

    vertices.push(xInner, y, zInner);
  //  uvs.push(0.25*u*uscale, 0);

    vertices.push(xOuter, y, zOuter);
    //uvs.push(0.25*u*uscale, 0.25*1);
    
    uvs.push(0, 3*0.25 * u * uscale); // bottom inner
uvs.push(0.25*2, 3*0.25 * u * uscale); // bottom outer

  }

  for (let ix = 0; ix < angleSegments; ix++) {
    const a = indexOffset + ix * 2;
    const b = a + 2;
    const c = a + 1;
    const d = b + 1;

    indices.push(b, a, c);
    indices.push(b, c, d);
  }

  // === Build Mesh ===
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const material = new THREE.MeshStandardMaterial({
    map: wallTex,
    //side: THREE.DoubleSide,
    wireframe: false
  });
  
  geometry.computeVertexNormals();
  
  // physics:
  addCurvedGatePhysics(world, startAngle, endAngle, arenaRadius, wallHeight, wallThickness, angleSegments, ypos);
  
  return new THREE.Mesh(geometry, material);
}

function createCurvedGateExtension({
  arenaRadius = 1,
  wallHeight = 0.4,
  segmentCount = 16,
  wallThickness = 0.1,
  centerAngle = Math.PI / 2, // radians
  color = 0xff00ff,
  y = 0
} = {}) {  
  const wallSegments=16;//segmentCount;
  const mesh1 =  createCurvedPillar({ // left side from center
        arenaRadius: arenaRadius,
        wallHeight: wallHeight,
        wallThickness: wallThickness,
        startAngle: centerAngle - (1 / wallSegments) * Math.PI * 2 / 2,
        endAngle: centerAngle-(wallHeight / arenaRadius) ,//+ (1 / wallSegments) * Math.PI * 2 / 2,
        segmentCount: Math.ceil(0.5*0.25*segmentCount),
        y: y
      });
  
  const mesh2 =  createCurvedPillar({ // right side from center
        arenaRadius: arenaRadius,
        wallHeight: wallHeight,
        wallThickness: wallThickness,
        startAngle: centerAngle + (wallHeight / arenaRadius) ,//- (1 / wallSegments) * Math.PI * 2 / 2,
        endAngle: centerAngle + (1 / wallSegments) * Math.PI * 2 / 2,
        segmentCount: Math.ceil(0.5*0.25*segmentCount),
        y: y
      });

  const merged = BufferGeometryUtils.mergeGeometries([mesh1.geometry, mesh2.geometry], true);
  const mesh = new THREE.Mesh(
    merged,
  new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.DoubleSide, wireframe: false }));
  return mesh;
}

  function createPhysicsBodyForCurvedPillarSegment(p1, p2, p3, p4, p5, p6, p7, p8) {
  const verts = [p1, p2, p3, p4, p5, p6, p7, p8].map(v => new CANNON.Vec3(...v));
  const faces = [
    [0, 1, 2, 3], // bottom
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // outer
    [3, 2, 6, 7], // inner
    [0, 3, 7, 4], // left
    [1, 2, 6, 5]  // right
  ];
  const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  return body;
}
  
function createCurvedPillar({ 
  arenaRadius = 1,
  wallHeight = 0.4,
  segmentCount = 16,
  heightSegments = 1,
  wallThickness = 0.1,
  startAngle = Math.PI / 2 - (1 / 16) * Math.PI * 2 / 2,
  endAngle = Math.PI / 2 + (1 / 16) * Math.PI * 2 / 2,
  y = 0
} = {}) {
  const angleSegments = segmentCount;
  const heightSteps = heightSegments;
  const thetaLength = endAngle - startAngle;
  const uscale = 4 * thetaLength / ((1 / 16) * Math.PI * 2);

  const radiusInner = arenaRadius;
  const radiusOuter = arenaRadius + wallThickness;

  const vertices = [];
  const uvs = [];
  const indices = [];

  let indexOffset = 0;

  // --- FRONT AND BACK WALL FACES ---
  for (let iy = 0; iy <= heightSteps; iy++) {
    const v = iy / heightSteps;
    const y = v * wallHeight;

    for (let ix = 0; ix <= angleSegments; ix++) {
      const u = ix / angleSegments;
      const angle = startAngle + u * thetaLength;

      const xOuter = Math.cos(angle) * radiusOuter;
      const zOuter = Math.sin(angle) * radiusOuter;
      const xInner = Math.cos(angle) * radiusInner;
      const zInner = Math.sin(angle) * radiusInner;

      vertices.push(xOuter, y, zOuter);
      uvs.push(0.25 * u * uscale, 0.25 * v);

      vertices.push(xInner, y, zInner);
      uvs.push(0.25 * u * uscale, 0.25 * v);
    }
  }

  const vertsPerRow = (angleSegments + 1) * 2;

  for (let iy = 0; iy < heightSteps; iy++) {
    for (let ix = 0; ix < angleSegments; ix++) {
      const a = iy * vertsPerRow + ix * 2;
      const b = a + vertsPerRow;
      const c = b + 2;
      const d = a + 2;

      indices.push(a, b, d);
      indices.push(b, c, d);

      indices.push(a + 1, d + 1, b + 1);
      indices.push(b + 1, d + 1, c + 1);
    }
  }

  indexOffset = vertices.length / 3;

  // --- SIDE WALLS ---
  for (let side = 0; side <= 1; side++) {
    const angle = side === 0 ? startAngle : endAngle;

    for (let iy = 0; iy <= heightSteps; iy++) {
      const v = iy / heightSteps;
      const y = v * wallHeight;

      const xOuter = Math.cos(angle) * radiusOuter;
      const zOuter = Math.sin(angle) * radiusOuter;
      const xInner = Math.cos(angle) * radiusInner;
      const zInner = Math.sin(angle) * radiusInner;

      vertices.push(xInner, y, zInner);
      uvs.push(0, 0.25 * v);

      vertices.push(xOuter, y, zOuter);
      uvs.push(1 * 0.25, 0.25 * v);
    }

    for (let iy = 0; iy < heightSteps; iy++) {
      const a = indexOffset + iy * 2;
      const b = a + 2;
      const c = a + 1;
      const d = b + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    indexOffset += (heightSteps + 1) * 2;
  }

  // --- TOP SURFACE ---
  for (let ix = 0; ix <= angleSegments; ix++) {
    const u = ix / angleSegments;
    const angle = startAngle + u * thetaLength;

    const xOuter = Math.cos(angle) * radiusOuter;
    const zOuter = Math.sin(angle) * radiusOuter;
    const xInner = Math.cos(angle) * radiusInner;
    const zInner = Math.sin(angle) * radiusInner;

    vertices.push(xInner, wallHeight, zInner);
    uvs.push(0.25 * u * uscale, 0);

    vertices.push(xOuter, wallHeight, zOuter);
    uvs.push(0.25 * u * uscale, 0.25);
  }

  for (let ix = 0; ix < angleSegments; ix++) {
    const a = indexOffset + ix * 2;
    const b = a + 2;
    const c = a + 1;
    const d = b + 1;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  indexOffset += (angleSegments + 1) * 2;

  // --- BOTTOM SURFACE ---
  for (let ix = 0; ix <= angleSegments; ix++) {
    const u = ix / angleSegments;
    const angle = startAngle + u * thetaLength;

    const xOuter = Math.cos(angle) * radiusOuter;
    const zOuter = Math.sin(angle) * radiusOuter;
    const xInner = Math.cos(angle) * radiusInner;
    const zInner = Math.sin(angle) * radiusInner;

    vertices.push(xInner, 0, zInner);
    uvs.push(0.25 * u * uscale, 0);

    vertices.push(xOuter, 0, zOuter);
    uvs.push(0.25 * u * uscale, 0.25);
  }

  for (let ix = 0; ix < angleSegments; ix++) {
    const a = indexOffset + ix * 2;
    const b = a + 2;
    const c = a + 1;
    const d = b + 1;

    indices.push(b, a, c);
    indices.push(b, c, d);
  }

  // === Build Mesh ===
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: wallTex,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  //scene.add(mesh);

  // === Add Trapezoidal Physics Segments ===
  for (let iy = 0; iy < heightSteps; iy++) {
    const y0 = iy / heightSteps * wallHeight;
    const y1 = (iy + 1) / heightSteps * wallHeight;

    for (let ix = 0; ix < angleSegments; ix++) {
      const u0 = ix / angleSegments;
      const u1 = (ix + 1) / angleSegments;
      const a0 = startAngle + u0 * thetaLength;
      const a1 = startAngle + u1 * thetaLength;

      const x00 = Math.cos(a0) * radiusInner;
      const z00 = Math.sin(a0) * radiusInner;
      const x01 = Math.cos(a0) * radiusOuter;
      const z01 = Math.sin(a0) * radiusOuter;
      const x10 = Math.cos(a1) * radiusInner;
      const z10 = Math.sin(a1) * radiusInner;
      const x11 = Math.cos(a1) * radiusOuter;
      const z11 = Math.sin(a1) * radiusOuter;

      const p1 = [x00, y0, z00];
      const p2 = [x01, y0, z01];
      const p3 = [x11, y0, z11];
      const p4 = [x10, y0, z10];
      const p5 = [x00, y1, z00];
      const p6 = [x01, y1, z01];
      const p7 = [x11, y1, z11];
      const p8 = [x10, y1, z10];

      const body = createPhysicsBodyForCurvedPillarSegment(p1, p2, p3, p4, p5, p6, p7, p8);
      body.position.set(0,y,0);
      world.addBody(body);
    }
  }

  return mesh;
}


function createTileMat(center, radius, texture) {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vWorldXZ;
      varying vec2 vUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        vUv = uv * 2.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vWorldXZ;
      varying vec2 vUv;
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform sampler2D uTexture;
      void main() {
        if (length(vWorldXZ - uCenter) > uRadius) discard;
        gl_FragColor = texture2D(uTexture, vUv);
      }
    `,
    uniforms: {
      uCenter: { value: center },
      uRadius: { value: radius },
      uTexture: { value: texture }
    },
    transparent: true
  });
}

function addArchFootPillars({
  arenaRadius = 1,
  centerAngle,
  holeRadius, //unused
  wallHeight,
  y,
  radius,
  pillarRadius = 0.05,
  scene,
  material
}) {
  const angles = [
    centerAngle - (wallHeight / arenaRadius),
    centerAngle + (wallHeight / arenaRadius),
  ];

  for (let i = 0; i < 2; i++) {
    const angle = angles[i];

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const height = wallHeight;

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(pillarRadius, pillarRadius, height, 8),
      material || new THREE.MeshStandardMaterial({ color: '#888', wireframe: false })
    );

    pillar.position.set(x, y+height / 2 , z);
    pillar.lookAt(0, y+height / 2, 0); // face center - changing the y coordinate skews the pillar in- or outside
    scene.add(pillar);
  }
}

const texLoader = new THREE.TextureLoader();
const grassTex = texLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(2, 2);

const wallTex = texLoader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(1, 1);

function createTileBody(px, pz, tileSize, arenaRadius, arenaScaling, yCenter = 0, height = 0.1) {
  const yTop = yCenter + height / 2;
  const yBottom = yCenter - height / 2;

  function clampToArena(x, z, radius) {
    const dist = Math.hypot(x, z);
    if (dist > radius) {
      const scale = radius / dist;
      return [x * scale, z * scale];
    }
    return [x, z];
  }

  const half = 0.5 * tileSize;
 /* let corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];*/
  let corners = [
    [-half, half],
    [half, half],
    [half, -half],
    [-half, -half],
  ];

  corners = corners.map(([dx, dz]) => {
    const x = px + dx;
    const z = pz + dz;
    return clampToArena(x, z, arenaRadius);
  });

  const verts = [
    ...corners.map(([x, z]) => new CANNON.Vec3(x, yBottom, z)),
    ...corners.map(([x, z]) => new CANNON.Vec3(x, yTop, z)),
  ];

  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7]
  ];

  const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  return body;
}


function createTileBodyold(px, pz, tileSize, yHeight = 0.05) {
  const half = tileSize / 2;
  const corners = [
    [px - half, pz - half],
    [px + half, pz - half],
    [px + half, pz + half],
    [px - half, pz + half]
  ];

  const inside = corners.map(([x, z]) => Math.sqrt(x * x + z * z) <= arenaRadius);
  const allInside = inside.every(v => v);
  const allOutside = inside.every(v => !v);

  if (allOutside) return null; // Skip entirely

  if (allInside) {
    // Use box
    const shape = new CANNON.Box(new CANNON.Vec3(half, yHeight, half));
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    body.addShape(shape);
    body.position.set(px, 2 * wallHeightUnit - 0.05, pz);
    return body;
  }

  // Partial tile — use convex poly
  const verts = [];
  const faces = [[0, 1, 2], [0, 2, 3]]; // top face

  for (let i = 0; i < 4; i++) {
    const [x, z] = corners[i];
    verts.push(new CANNON.Vec3(x, 2 * wallHeightUnit, z));       // top
    verts.push(new CANNON.Vec3(x, 2 * wallHeightUnit - 0.1, z)); // bottom
  }

  faces.push([0, 1, 5], [0, 5, 4]); // side 1
  faces.push([1, 2, 6], [1, 6, 5]); // side 2
  faces.push([2, 3, 7], [2, 7, 6]); // side 3
  faces.push([3, 0, 4], [3, 4, 7]); // side 4
  faces.push([4, 5, 6], [4, 6, 7]); // bottom

  const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
  const body = new CANNON.Body({ type: CANNON.Body.STATIC });
  body.addShape(shape);
  return body;
}

// Arena Tiles
const tileGeo = new THREE.BoxGeometry(1 * arenaScaling, 0.1, 1 * arenaScaling);
const gridSize = 9;
const half = Math.floor(gridSize / 2);
for (let y = 0; y < gridSize; y++) {
  for (let x = 0; x < gridSize; x++) {
    const px = (x - half) * arenaScaling;
    const pz = (y - half) * arenaScaling;
    const tile = new THREE.Mesh(tileGeo, createTileMat(new THREE.Vector2(0, 0), arenaRadius, grassTex));
    tile.position.set(px, 2*wallHeightUnit + 0-0.05, pz); //-0.05+0.1
    scene.add(tile);
    
    // Add physics body
     //   const body = createTileBodyold(px, pz, tileSize);
        const body = createTileBody(px, pz, tileSize, arenaRadius, arenaScaling, 2*wallHeightUnit + 0-0.05);
   // body.position.set(px, 3 + 0.001, pz);

    if (body) world.addBody(body);
  }
}

// Fill ring between inner and outer wall at base
// ------------ dimensions ------------
//const innerRadius   = 1.2;
//const outerRadius   = 2.0;
const thickness     = 0.1 * arenaScaling;              // height in your world units
const radialSegs    = 64;               // same smoothness you had

// ------------ build 2-D shape ------------
  const radiusInner = arenaRadius - 0*wallThickness;
  const radiusOuter = arenaRadius + 1*wallThickness;
const shape = new THREE.Shape();
shape.absarc(0, 0, radiusOuter, 0, Math.PI * 2, false);  // outer circle

const hole = new THREE.Path();
hole.absarc(0, 0, radiusInner, 0, Math.PI * 2, true);    // inner circle (CW)
shape.holes.push(hole);

// ------------ extrude it ------------
const extrudeSettings = {
  depth:        thickness,     // how “thick” the ring is
  bevelEnabled: false,
  curveSegments: radialSegs,
  steps:         1
};

const ringGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
ringGeom.rotateX(-Math.PI / 2);                    // lie it flat like before
ringGeom.translate(0, -thickness, 0); // sink it the same amount

const ring = new THREE.Mesh(
  ringGeom,
  new THREE.MeshStandardMaterial({ color: '#555' })
);
scene.add(ring);


// Glow zones
/*const glowSprites = [];
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2;
  const r = 2.5;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  const spriteMap = texLoader.load('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Rendered_Green_Sphere.png/250px-Rendered_Green_Sphere.png');
  const spriteMaterial = new THREE.SpriteMaterial({
    map: spriteMap,
    color: 0x66ccff,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(x,2*wallHeightUnit + 0-0.05 +  0.08, z);
  sprite.scale.set(1.5 * arenaScaling, 1.5 * arenaScaling, 1.5 * arenaScaling);
  scene.add(sprite);
  glowSprites.push(sprite);
} */
  
  function addBentRadialArch({ scene, radius, angleStart, angleEnd, y, archRise = 0.25, tubeRadius = 0.03, segments = 16, color = 0x888888 }) {
  const curve = new THREE.Curve();
  curve.getPoint = function (t) {
    
    const angle = angleStart + (angleEnd - angleStart) * t;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const centerAngle = angleStart + (angleEnd - angleStart)*0.5;
    const holeRadius = wallHeight;
    // due to numeric error, limit to (-1,1)
    const cosArg = Math.min(Math.max((angle - centerAngle) * (arenaRadius / holeRadius),-1),1);
    const yOffset = y + Math.sin(Math.acos(cosArg)) * holeRadius;
    //const yOffset = y + Math.sin(Math.PI * t) * archRise; // peak at t=0.5
    //const yOffset = y+t;//y + Math.sin(Math.PI * t) * archRise; // peak at t=0.5
    return new THREE.Vector3(x, yOffset, z);
  };

  const geometry = new THREE.TubeGeometry(curve, segments, tubeRadius, 8, false);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}


// Walls, torches, lips, arches, columns, vertical gap fillers
const torches = [];
const wallData = [];
//const archData = []; // Store arch positions for vertical fillers
 // Store wall segment positions for gap filling
for (let col = 0; col < wallSegments; col++) {
  const angle = (col / wallSegments) * Math.PI * 2;
  const thetaStart = angle;
  const thetaLength = (1 / wallSegments) * Math.PI * 2;
  const chars = wallLayout.map(row => row[col]);
  for (let row = 0; row < chars.length; row++) {
    const char = chars[row];

    if (char === 'G') {
      const y = (wallLayout.length - 1 - row) * wallHeightUnit;
      const gate = createCurvedGateTile({
        arenaRadius: arenaRadius,
        wallHeight: wallHeightUnit,
        wallThickness: wallThickness,//outerRadius - innerRadius, //0.2,
        segmentCount: 16*0.5,
        heightSegments: 1,
       // centerAngle: angle + (Math.PI * 2) / wallSegments / 2, // mid of tile
        startAngle: angle + (Math.PI * 2) / wallSegments / 2 - (1 / wallSegments) * Math.PI * 2 / 2,
        endAngle: angle + (Math.PI * 2) / wallSegments / 2 + (1 / wallSegments) * Math.PI * 2 / 2,
        ypos: y
      });
      gate.position.y = y;
      scene.add(gate); // or wallGroup.add(gate) if you're grouping walls
      
        //const y = (wallLayout.length - 1 - row) * wallHeightUnit;
  const centerAngle = angle + thetaLength / 2;
    
      
  // Add inner bent arch
  const pillarR = 0.05;
  const innerRadius = arenaRadius - 0*wallThickness;
  const outerRadius = arenaRadius + 1*wallThickness;
  addBentRadialArch({
    scene,
    radius: innerRadius + 0.5 * pillarR,
    angleStart: centerAngle - (wallHeight / arenaRadius),
    angleEnd: centerAngle + (wallHeight / arenaRadius),
    y: y,
    archRise: 1 * wallHeightUnit,
    tubeRadius: pillarR * arenaScaling
  });

  // Add outer bent arch
  addBentRadialArch({
    scene,
    radius: outerRadius - 0.5 * pillarR,
    angleStart: centerAngle - (wallHeight / arenaRadius),
    angleEnd: centerAngle + (wallHeight / arenaRadius),
    //angleStart: thetaStart,
    //angleEnd: thetaStart + thetaLength,
    y: y,
    archRise: 1 * wallHeightUnit,
    tubeRadius: arenaScaling * pillarR
  });

    } else if (char === "P") {
       const y = (wallLayout.length - 1 - row) * wallHeightUnit;
      const gate = createCurvedPillar({
        arenaRadius: arenaRadius,
        wallHeight: wallHeightUnit,
        wallThickness: wallThickness,// outerRadius - innerRadius, //0.2,
        //centerAngle: angle + (Math.PI * 2) / wallSegments / 2, // mid of tile
     //   thetaLength: (1 / wallSegments) * Math.PI * 2,
        startAngle: angle + (Math.PI * 2) / wallSegments / 2 - (1 / wallSegments) * Math.PI * 2 / 2,
        endAngle: angle + (Math.PI * 2) / wallSegments / 2 + (1 / wallSegments) * Math.PI * 2 / 2,
        segmentCount: wallSegments*0.5,
        y: y
      });
      gate.position.y = y;
      scene.add(gate); // or wallGroup.add(gate) if you're grouping walls
      
    // Store wall presence for this tile
    wallData.push({ col, row, y, angle, thetaStart, thetaLength });
      
      continue;  
      
    } else if (char === "Q") {
       const y = (wallLayout.length - 1 - row) * wallHeightUnit;
      const gate = createCurvedGateExtension({
        arenaRadius: arenaRadius,
        wallHeight: wallHeightUnit,
        wallThickness: wallThickness, //outerRadius - innerRadius, //0.1,
        centerAngle: angle + (Math.PI * 2) / wallSegments / 2, // mid of tile
        segmentCount: wallSegments,
        y: y
      });
      gate.position.y = y;
      scene.add(gate); // or wallGroup.add(gate) if you're grouping walls
      //continue;    
      
      // pillars left and right?
      const centerAngle = thetaStart + thetaLength / 2;
      const holeRadius = wallHeightUnit;
      //const archRadius = (innerRadius + outerRadius) / 2;
      const pillarR = 0.05;
      const ycoord = (wallLayout.length - 1 - row) * wallHeightUnit;
      const innerRadius = arenaRadius - 0*wallThickness;
  const outerRadius = arenaRadius + 1*wallThickness;
      // inner radius
      addArchFootPillars({
        arenaRadius: arenaRadius,
        centerAngle: centerAngle,
        holeRadius: holeRadius,
        wallHeight: wallHeightUnit,
        y: ycoord,
        radius: innerRadius+0.5*pillarR,
        pillarRadius: pillarR*arenaScaling,
        scene
      });
      // outer radius
      addArchFootPillars({
        arenaRadius: arenaRadius,
        centerAngle,
        holeRadius,
        wallHeight: wallHeightUnit,
        y: ycoord,
        radius: outerRadius-1*0.5*pillarR,
        pillarRadius: pillarR*arenaScaling,
        scene
      });
      
/*        // Add inner bent arch
  addBentRadialArch({
    scene,
    radius: innerRadius + 0.5 * pillarR,
    angleStart: centerAngle - (wallHeight / arenaRadius),
    angleEnd: centerAngle + (wallHeight / arenaRadius),
    y: y + wallHeightUnit,
    archRise: 1 * wallHeightUnit,
    tubeRadius: pillarR * arenaScaling
  });

  // Add outer bent arch
  addBentRadialArch({
    scene,
    radius: outerRadius - 0.5 * pillarR,
    angleStart: centerAngle - (wallHeight / arenaRadius),
    angleEnd: centerAngle + (wallHeight / arenaRadius),
    //angleStart: thetaStart,
    //angleEnd: thetaStart + thetaLength,
    y: y + wallHeightUnit,
    archRise: 1 * wallHeightUnit,
    tubeRadius: arenaScaling * pillarR
  });
      */
      continue;
    }
    
    const y = (wallLayout.length - 1 - row) * wallHeightUnit + wallHeightUnit / 2;
//lip
    if (char === 'L') {
      const innerRadius = arenaRadius - 0*wallThickness;
      const outerRadius = arenaRadius + 1*wallThickness;
      const lipHeight = y + wallHeightUnit / 2 - wallHeightUnit;
      const profile = [
        new THREE.Vector2(outerRadius, lipHeight),
        new THREE.Vector2(outerRadius + 0.05*arenaScaling, lipHeight + 0.1*arenaScaling),
        new THREE.Vector2(innerRadius - 0.05*arenaScaling, lipHeight + 0.1*arenaScaling),
        new THREE.Vector2(innerRadius, lipHeight)
      ];
      
      const thetaLength = (Math.PI * 2) / wallSegments;
      const startAngle = angle ;//+ (Math.PI/ wallSegments) - (Math.PI / wallSegments);
      const endAngle = angle + thetaLength ;
      const centerAngle = startAngle+0.5*thetaLength;
      
      const lipGeo = new THREE.LatheGeometry(profile, 16, startAngle+3*(endAngle-startAngle), endAngle-startAngle);//thetaStart, thetaLength);
      const lipMaterial = new THREE.MeshStandardMaterial({ color: '#999', metalness: 0.2, wireframe: false });
      const lip = new THREE.Mesh(lipGeo, lipMaterial);
     // scene.add(lip);
      
      function createCap(angle, left) {
        const capGeo = new THREE.BufferGeometry();
        const capVerts = [];
        const center = new THREE.Vector3(
          Math.cos(angle) * innerRadius,
          profile[0].y,
          Math.sin(angle) * innerRadius
        );

        for (let i = 0; i < profile.length - 1; i++) {
          const r1 = profile[i].x;
          const y1 = profile[i].y;
          const r2 = profile[i + 1].x;
          const y2 = profile[i + 1].y;

          const p1 = new THREE.Vector3(Math.cos(angle) * r1, y1, Math.sin(angle) * r1);
          const p2 = new THREE.Vector3(Math.cos(angle) * r2, y2, Math.sin(angle) * r2);

          // Triangle: p1 → p2 → center
          if (left)
            capVerts.push(...p2.toArray(), ...p1.toArray(), ...center.toArray());
          else
            capVerts.push(...p1.toArray(), ...p2.toArray(), ...center.toArray());
        }

        capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capVerts, 3));
        capGeo.computeVertexNormals();

        return new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: '#999' }));
      }
      function createCurvedLip({
        centerAngle,
        startAngle,
        endAngle,
        innerRadius,
        outerRadius,
        wallHeight,
        segments = 16,
        scene,
        material
      }) {
        const lipHeight = (y + wallHeightUnit / 2 - wallHeightUnit); //wallHeight / 2; 
        const thetaLength = endAngle - startAngle;

        // Profile for the lip (following the wall curve)
        const profile = [
          new THREE.Vector2(outerRadius, lipHeight),
          new THREE.Vector2(outerRadius + 0.05*arenaScaling, lipHeight + 0.1*arenaScaling),
          new THREE.Vector2(innerRadius - 0.05*arenaScaling, lipHeight + 0.1*arenaScaling),
          new THREE.Vector2(innerRadius, lipHeight)
        ];

        // Create Lathe Geometry using the correct start and end angles
        const lipGeo = new THREE.LatheGeometry(profile, segments, -startAngle+thetaLength*3, thetaLength);
        const lip = new THREE.Mesh(lipGeo, material || new THREE.MeshStandardMaterial({ color: '#999', metalness: 0.2 }));

        return lip;
      }

      scene.add(createCap(startAngle,true));
      scene.add(createCap(endAngle,false));
     // const lipMaterial = new THREE.MeshStandardMaterial({ color: '#999', metalness: 0.2 });
      const lipnew = createCurvedLip({
        centerAngle,
        startAngle,
        endAngle,
        innerRadius,
        outerRadius,
        wallHeight: wallHeightUnit,
        segments: 16,
        scene,
        material: lipMaterial
      });
      scene.add(lipnew);

    }

    if (char === 'T') {
      const innerRadius = arenaRadius - 0*wallThickness;
  const outerRadius = arenaRadius + 1*wallThickness;
      const h = y - 2*wallHeightUnit / 2;
      const tx = Math.cos(angle + thetaLength / 2) * 0.5*(innerRadius + outerRadius);
      const tz = Math.sin(angle + thetaLength / 2) * 0.5*(innerRadius + outerRadius);

      const torch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6),
        new THREE.MeshStandardMaterial({ color: '#553311' })
      );
      torch.position.set(tx, h, tz);
      torch.lookAt(0, h, 0);
      scene.add(torch);

     // const flame = new THREE.Mesh(
     //   new THREE.SphereGeometry(0.1, 8, 8),
     //   new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.9 })
     // );
     // flame.position.set(tx, h + 0.35, tz);
     // scene.add(flame);

      const light = new THREE.PointLight(0xffaa33, 1, 5);
      light.position.set(tx, h + 0.35, tz);
      scene.add(light);
      
      
      /* ---------- 1. geometry (a squashed sphere) ---------- */
const R = 0.12;                  // base radius
const H = 0.28;                  // final flame height
const geo = new THREE.SphereGeometry(R, 32, 32);
geo.translate(0, R-0.15, 0);      // put origin at the base
geo.scale   (0.7, (H / R)-2*0.35, 0.7);   // taper   (x,z)  and stretch (y)

/* ---------- 2. material with custom shaders ---------- */
const flameMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 } },
  vertexShader: /* glsl */`
    #include <common>           // gives us GLSL noise() helpers
    uniform float time;
    varying float vHeight;

    float hash( vec2 p ) { return fract( sin( dot(p, vec2(127.1, 311.7)) ) * 43758.5453 ); }
    float noise( vec3 x ){
      vec3 p = floor(x), f = fract(x);
      f = f*f*(3.0-2.0*f);
      float n = p.x + p.y*57.0 + 113.0*p.z;
      return mix(
               mix( mix( hash(vec2(n +   0.0)), hash(vec2(n +   1.0)), f.x ),
                    mix( hash(vec2(n +  57.0)), hash(vec2(n +  58.0)), f.x ), f.y ),
               mix( mix( hash(vec2(n + 113.0)), hash(vec2(n + 114.0)), f.x ),
                    mix( hash(vec2(n + 170.0)), hash(vec2(n + 171.0)), f.x ), f.y ),
               f.z );
    }

    void main() {
      vec3 p = position;
      float wobble = noise(vec3(p.xz*4.0, time*3.0 + p.y*2.0));
      p.xy += wobble * 0.03;           // swirl the flame
      vHeight = clamp(p.y * 4.0, 0.0, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying float vHeight;

    void main() {
      /* --- vertical heat-map: blue → yellow → orange --- */
      vec3 blue   = vec3(0.2, 0.4, 1.0);
      vec3 yellow = vec3(1.0, 0.9, 0.6);
      vec3 orange = vec3(1.0, 0.3, 0.0);
      vec3 col    = mix(yellow, orange, vHeight);
      col         = mix(blue, col, smoothstep(0.05, 0.25, vHeight));

      /* --- fade out the tip & edges --- */
      float alpha = 1.0 - smoothstep(0.7, 1.0, vHeight);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent : true,
  blending    : THREE.AdditiveBlending,
  depthWrite  : false,
  side        : THREE.DoubleSide,
});

      
/* ---------- 3. mesh & scene ---------- */
const flame = new THREE.Mesh(geo, flameMat);
      flame.position.set(tx, h + 0.35, tz)
scene.add(flame);

/* an optional flickering point-light */
//const light = new THREE.PointLight(0xffbb66, 0.8, 2);
//light.position.copy(flame.position);
//scene.add(light);

      torches.push({ light, flame });
    }

  }
}

// === Efficient Panel Filler for Vertical Wall Gaps ===
// Fill vertical wall gaps between inner and outer segments
const fillerPanels = new THREE.Group();
const panelGeo = new THREE.PlaneGeometry(wallThickness, wallHeightUnit);
const panelMat = new THREE.MeshStandardMaterial({ color: '#999', side: THREE.DoubleSide });
wallData.forEach(({ col, row, y, angle, thetaStart, thetaLength }) => {
  const check = (rOffset, cOffset) => {
    const r = row + rOffset;
    const c = (col + cOffset + wallSegments) % wallSegments;
    if (r < 0 || r >= wallLayout.length) return false;
    return wallLayout[r][c] !== '.';
  };
  const missingAbove = !check(-1, 0);
  const missingLeft = !check(0, -1);
  const missingRight = !check(0, 1);
  const createMergedPanel = (angleOffset) => {
    const panel = new THREE.Mesh(panelGeo, panelMat);
    const midAngle = angle + thetaLength / 2 + angleOffset;
    const innerRadius = arenaRadius - 0*wallThickness;
  const outerRadius = arenaRadius + 1*wallThickness;
    const radius = (outerRadius + innerRadius) / 2;
    panel.position.set(
      Math.cos(midAngle) * radius,
      y,
      Math.sin(midAngle) * radius
    );
    panel.rotation.y = -midAngle;
  // Debug visibility
  // panel.material.wireframe = true;
    fillerPanels.add(panel);
  };
  //if (missingAbove) createMergedPanel(0);
  if (missingLeft) createMergedPanel(-thetaLength / 2);
  if (missingRight) createMergedPanel(thetaLength / 2);
});

scene.add(fillerPanels);


///
///  
  //////////////



  // Player Marble
  const ballRadius = 1;
  const marbleGeometry = new THREE.IcosahedronGeometry(ballRadius, 1);
  const marbleMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333 });
  marble = new THREE.Mesh(marbleGeometry, marbleMaterial);
  marble.castShadow = true;
  scene.add(marble);

  marbleBody = new CANNON.Body({ 
    mass: 1, linearDamping: 0.6, angularDamping: 0.8, 
    shape: new CANNON.Sphere(ballRadius), position: new CANNON.Vec3(0, 5, 0) });
  world.addBody(marbleBody);

  // CPU-Controlled Marbles
  const cpuMaterial = new THREE.MeshStandardMaterial({ color: 0x3333ff });
  for (let i = 0; i < 3; i++) {
    const cpuMaterial = new THREE.MeshStandardMaterial({ color: cpuColors[i] });
    const mesh = new THREE.Mesh(marbleGeometry, cpuMaterial);
    mesh.castShadow = true;
    const x = Math.random() * 40 - 20;
    const z = Math.random() * 40 - 20;
    mesh.position.set(x, 1, z);
    mesh.userData.behavior = cpuBehaviors[i];
    scene.add(mesh);
    const labelDiv = document.createElement('div');
    labelDiv.innerHTML = `<div style='display: flex; align-items: center; gap: 4px;'>
          <div style='width: 10px; height: 10px; border-radius: 50%; background-color: #${cpuColors[i].toString(16).padStart(6, '0')};'></div>
          <span>${cpuBehaviors[i]}</span>
        </div>
        <div class='health-bar' style='width: 40px; height: 5px; background: #222; margin-top: 2px;'>
          <div id='cpu-health-${i}' style='width: 100%; height: 100%; background: #f00;'></div>
        </div>`;
    labelDiv.style.position = 'absolute';
    labelDiv.style.color = 'white';
    labelDiv.style.fontSize = '12px';
    labelDiv.style.background = 'rgba(0,0,0,0.6)';
    labelDiv.style.padding = '2px 6px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.pointerEvents = 'none';
    labelDiv.setAttribute('data-label-id', `cpu-label-${i}`);
    labelDiv.setAttribute('id', `cpu-infobox-${i}`);
    document.body.appendChild(labelDiv);

    mesh.userData.label = labelDiv;
    mesh.userData.healthBar = document.getElementById(`cpu-health-${i}`);
    cpuMarbles.push(mesh);

    const body = new CANNON.Body({
      mass: 1, linearDamping: 0.6, angularDamping: 0.8, 
      shape: new CANNON.Sphere(ballRadius), position: new CANNON.Vec3(x, 5, z) });
    world.addBody(body);
    cpuBodies.push(body);
  }

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'w' || e.key === 'W') && !e.repeat) {
      setWireframeMode(!wireframeEnabled);
      return;
    }
    keys[e.key] = true;
  });
  window.addEventListener('keyup', (e) => keys[e.key] = false);
}



function setupCollisionDetection() {
  world.addEventListener('postStep', () => {
    for (let i = 0; i < cpuBodies.length; i++) {
      const cpuBody = cpuBodies[i];
      if (cpuMarbles[i].userData.suddenDeath && cpuIsDashing[i]) {
        for (let j = 0; j < cpuBodies.length; j++) {
          if (j !== i) {
            const dxj = cpuBodies[j].position.x - cpuBodies[i].position.x;
            const dzj = cpuBodies[j].position.z - cpuBodies[i].position.z;
            const distSq = dxj * dxj + dzj * dzj;
            if (distSq < 4) {
              if (!cpuMarbles[j].userData.suddenDeath) {
                // Trigger sudden death for target CPU
                triggerSuddenDeath(cpuMarbles[j], cpuBodies[j], false, j);
              }
              // Explosion on impact
              createExplosion(cpuBodies[i].position, cpuMarbles[i].material.color.getHex());
              createExplosion(cpuBodies[j].position, cpuMarbles[j].material.color.getHex());

              // Optional: push both away
              const blow = new CANNON.Vec3(dxj, 0.2, dzj).unit().scale(15);
              cpuBodies[j].applyImpulse(blow, cpuBodies[j].position);
              cpuBodies[i].applyImpulse(blow.scale(-1), cpuBodies[i].position);
            }
          }
        }
      }

      if (marbleBody && marbleBody.position && cpuBody.position) {
        const dx = marbleBody.position.x - cpuBody.position.x;
        const dz = marbleBody.position.z - cpuBody.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 4) {
        if (ENABLE_KNOCKBACK) {
          const knockback = new CANNON.Vec3(dx, 0, dz).scale(20 / Math.sqrt(distSq));
          if (playerIsDashing) {
            cpuBody.applyImpulse(knockback, cpuBody.position);
          } else if (cpuIsDashing[i] && !playerShieldActive) {
            marbleBody.applyImpulse(knockback.scale(-1), marbleBody.position);
          }
        }

        // Health impact
        if (!playerShieldActive && cpuIsDashing[i]) health.player -= marble.userData.suddenDeath ? 100 : 1;
        if (playerIsDashing) health.cpu[i] -= 1;

        document.getElementById('player-health-bar').style.width = `${Math.max(0, health.player)}%`;
        const hud = document.getElementById('hud');
        if (health.player <= 30) {
          hud.classList.add('low-health');
        } else {
          hud.classList.remove('low-health');
        }
        marble.material.emissive = new THREE.Color(0xff0000);
        marble.material.emissiveIntensity = 1;
        marble.material.needsUpdate = true;
        marble.material.color.set(0xff6666);
        marble.userData.hit = true;
        setTimeout(() => { marble.userData.hit = false; marble.material.color.set(0xff3333); }, 200);
        }
      }
    }
  });
}

function createSuddenDeathAura(position, color = 0xff0000) {
  const geometry = new THREE.SphereGeometry(0.05, 4, 4);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });

  const particle = new THREE.Mesh(geometry, material);
  particle.position.copy(position);
  scene.add(particle);

  const dir = new THREE.Vector3(
    (Math.random() - 0.5) * 0.3,
    Math.random() * 0.2,
    (Math.random() - 0.5) * 0.3
  );
  const speed = 0.05 + Math.random() * 0.02;
  let age = 0;
  const lifetime = 400;

  const animateParticle = () => {
    if (!scene.children.includes(particle)) return;

    particle.position.addScaledVector(dir, speed);
    particle.material.opacity -= 0.015;
    age += 16;

    if (age >= lifetime || particle.material.opacity <= 0) {
      scene.remove(particle);
      return;
    }

    requestAnimationFrame(animateParticle);
  };

  animateParticle();
}

function addKillFeedMessage(msg) {
  const feed = document.getElementById('kill-feed');
  const entry = document.createElement('div');
  entry.textContent = msg;
  feed.prepend(entry);
  while (feed.children.length > 6) feed.removeChild(feed.lastChild);
}

  function triggerSuddenDeath(entity, body, isPlayer = false, index = null) {
    if (matchOver) return;
  
  if (isPlayer) {
    const label = document.getElementById('sudden-death-label');
    if (label) {
      label.style.display = 'block';
      setTimeout(() => label.style.display = 'none', 2000);
    }
  }
  
  if (isPlayer) {
    marbleLives++;
    health.player = 100;
    document.getElementById('player-health-bar').style.width = '100%';
  } else {
    health.cpu[index] = 100;
    cpuLives[index]++;
  }
  
  if (isPlayer) {
    document.getElementById('score-lives').textContent = marbleLives;
    addKillFeedMessage("⚠️ Player entered SUDDEN DEATH");
  } else {
    document.getElementById(`score-cpu-${index}`).textContent = cpuLives[index];
    addKillFeedMessage(`💥 CPU ${index + 1} entered SUDDEN DEATH`);
  }

  // Glow + Emissive
  entity.material.color.set(0xff0000);
  entity.material.emissive.set(0xff0000);
  entity.material.emissiveIntensity = 1.5;
  setTimeout(() => {
    entity.material.emissive.set(0x000000);
    if (!isPlayer) {
      entity.material.color.set(cpuColors[index]);
    } else {
      entity.material.color.set(0xff3333);
    }
  }, 1000);

  // Sudden Death Aura Burst
  createExplosion(entity.position, isPlayer ? 0xff0000 : cpuColors[index]);

  // Launch boost
  body.applyImpulse(new CANNON.Vec3(
    (Math.random() - 0.5) * 30,
    0,
    (Math.random() - 0.5) * 30
  ), body.position);

  // Red aura particle will be handled in animate()

  // Sudden death flag
  entity.userData.suddenDeath = true;

  // Sudden Death Pulse (scale animation)
  const initialScale = entity.scale.clone();
  entity.scale.set(1.5, 1.5, 1.5);
  let pulse = 0;
  const animatePulse = () => {
    pulse += 16;
    const t = pulse / 300;
    const scale = 1.5 - 0.5 * t;
    entity.scale.set(scale, scale, scale);
    if (t < 1) {
      requestAnimationFrame(animatePulse);
    } else {
      entity.scale.copy(initialScale);
    }
  };
  animatePulse();

  // Extra for player: screen shake
  if (isPlayer) {
    let shakeCount = 0;
    const originalPosition = camera.position.clone();
    const shakeInterval = setInterval(() => {
      shakeCount++;
      camera.position.x = originalPosition.x + (Math.random() - 0.5) * 0.5;
      camera.position.y = originalPosition.y + (Math.random() - 0.5) * 0.5;
      camera.position.z = originalPosition.z + (Math.random() - 0.5) * 0.5;
      if (shakeCount > 10) {
        clearInterval(shakeInterval);
        camera.position.copy(originalPosition);
      }
    }, 30);
  }

    console.log(isPlayer ? 'SUDDEN DEATH MODE triggered! Life lost.' : `CPU ${index} enters SUDDEN DEATH MODE!`);
  }

  function updateHealthStates() {
    if (matchOver) return;

    if (health.player <= 0) {
      createFallParticles(marble.position, 0xff3333);
      marbleLives++;
      document.getElementById('score-lives').textContent = marbleLives;
      addKillFeedMessage(`Player died! Lives lost: ${marbleLives}`);
      if (marbleLives < maxlives) {
        respawn(marbleBody);
        health.player = 100;
        document.getElementById('player-health-bar').style.width = '100%';
      }
    } else if (health.player <= 10) {
      triggerSuddenDeath(marble, marbleBody, true);
    }

    for (let i = 0; i < cpuBodies.length; i++) {
      if (health.cpu[i] <= 0) {
        const color = cpuMarbles[i].material.color.getHex();
        const body = cpuBodies[i];
        createFallParticles(cpuMarbles[i].position, color);
        cpuLives[i]++;
        document.getElementById(`score-cpu-${i}`).textContent = cpuLives[i];
        addKillFeedMessage(`CPU ${i + 1} died! Lives lost: ${cpuLives[i]}`);
        const x = Math.random() * 20 - 10;
        const z = Math.random() * 20 - 10;
        if (cpuLives[i] < maxlives) {
          respawn(body, x, z);
          health.cpu[i] = 100;
        }
      } else if (health.cpu[i] <= 10) {
        triggerSuddenDeath(cpuMarbles[i], cpuBodies[i], false, i);
      }
    }
  }

function restartGame() {
  // Reset game state
  matchOver = false;
  marbleLives = 0;
  cpuLives = [0, 0, 0];
  health = { player: 100, cpu: [100, 100, 100] };

  // Reset marble positions
  respawn(marbleBody);
  cpuBodies.forEach((body, i) => {
    const x = Math.random() * 20 - 10;
    const z = Math.random() * 20 - 10;
    respawn(body, x, z);
  });

  // Reset flags and visuals
  marble.userData.suddenDeath = false;
  cpuMarbles.forEach((m, i) => m.userData.suddenDeath = false);
  document.getElementById('sudden-death-label').style.display = 'none';
  document.getElementById('match-summary').style.display = 'none';
  document.getElementById('score-lives').textContent = '0';
  cpuLives.forEach((_, i) => {
    document.getElementById(`score-cpu-${i}`).textContent = '0';
    document.getElementById(`cpu-infobox-${i}`).style.display = '';
  });
  
  // Powerups
 // init_powerups();
  scene.userData.powerups.forEach((pickup) => {
    if (!pickup.userData.active) {
      pickup.visible = true;
      pickup.userData.active = true;
    }
  });

  // Reset physics and HUD
  world.gravity.set(0, -9.82, 0);
 // animate(); // restart the game loop
}

function showMatchSummary() {
  const stats = `
    <p><strong>Player Lives Lost:</strong> ${marbleLives}</p>
    <p><strong>CPU 1 Lives Lost:</strong> ${cpuLives[0]}</p>
    <p><strong>CPU 2 Lives Lost:</strong> ${cpuLives[1]}</p>
    <p><strong>CPU 3 Lives Lost:</strong> ${cpuLives[2]}</p>
  `;
  document.getElementById('summary-stats').innerHTML = stats;
  document.getElementById('match-summary').style.display = 'block';
    // restart button
  document.getElementById('match-restart-btn').addEventListener('click', () => {
     restartGame(); //window.location.reload();
  });
}

function animate() {
  if (isMobileDevice()) {
    const indicator = document.getElementById('tilt-indicator');
    const dot = document.getElementById('tilt-dot');
    const maxOffset = 30;
    
    // Use joystick if active
    if (window.joystickActive) {
      tiltForce.x = window.joystickVector.x;
      tiltForce.z = window.joystickVector.z;
    }
dot.style.transform = `translate(-50%, -50%) translate(${tiltForce.x * maxOffset}px, ${tiltForce.z * maxOffset}px)`;
  }
  // Pit swirl suction
  const pitRadius = 5; // define locally for suction logic //2
  const swirlDepth = 2;
  const swirlStrength = 10; //80

  [...cpuBodies, marbleBody].forEach((body) => {
    pitMeshes.forEach((pit) => {
      const px = pit.position.x;
      const pz = pit.position.z;
      const dx = px - body.position.x;
      const dz = pz - body.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < pitRadius + 1.5) {
        const force = new CANNON.Vec3(dx, -swirlDepth, dz).scale(swirlStrength / (distance + 1));
        body.applyForce(force, body.position);
      }
    });
  });
  // Animate pits
  pitMeshes.forEach((pit, i) => {
    const pulse = Math.sin(Date.now() * 0.003 + i) * 0.1 + 1;
    pit.scale.set(pulse, 1, pulse);
    if (pit.userData.ring) {
      pit.userData.ring.scale.set(pulse, pulse, pulse);
      pit.userData.ring.material.emissiveIntensity = 0.5 + 0.5 * Math.sin(Date.now() * 0.004 + i);
      pit.userData.ring.material.opacity = 0.6 + 0.3 * Math.sin(Date.now() * 0.002 + i);
    }
    pit.material.emissiveIntensity = 0.5 + 0.5 * Math.sin(Date.now() * 0.004 + i);
    pit.material.opacity = 0.7 + 0.2 * Math.sin(Date.now() * 0.002 + i);
  });
  if (playerJumpCooldown > 0) playerJumpCooldown--;
  if (playerDashCooldown > 0) playerDashCooldown--;
  if (marble.userData.hit) {
    marble.material.emissiveIntensity = 1;
  } else {
    marble.material.emissiveIntensity = 0;
  }
      requestAnimationFrame(animate);
      handleInput();
      updateCPU();
      world.step(1 / 60);
      updateHealthStates();
      if (waterEnabled && water) {
        water.material.uniforms['time'].value += 1.0 / 60.0;
      }

      // Out-of-bounds check
      if (marbleBody.position.y < -5 && marbleLives < maxlives) {
        createFallParticles(marble.position, 0xff3333);
        marbleLives++;
        document.getElementById('score-lives').textContent = marbleLives;
        addKillFeedMessage(`Player fell! Lives lost: ${marbleLives}`);
        if (marbleLives < maxlives) {
          respawn(marbleBody);
        } 
      }

      cpuBodies.forEach((body, i) => {
        if (cpuJumpCooldown[i] > 0) cpuJumpCooldown[i]--;
        //cpu dash cooldown missing???
        if (body.position.y < -5 && cpuLives[i] < maxlives) {
		  const color = cpuMarbles[i].material.color.getHex();
          createFallParticles(cpuMarbles[i].position, color);
          cpuLives[i]++;
          document.getElementById(`score-cpu-${i}`).textContent = cpuLives[i];
          addKillFeedMessage(`CPU ${i + 1} fell! Lives lost: ${cpuLives[i]}`);
          const x = Math.random() * 20 - 10;
          const z = Math.random() * 20 - 10;
          if (cpuLives[i] < maxlives) {
            respawn(body, x, z);
          } else {
            document.getElementById(`cpu-infobox-${i}`).style.display = 'none';
          }
        }
      });

      marble.position.copy(marbleBody.position);
      marble.quaternion.copy(marbleBody.quaternion);

      cpuMarbles.forEach((mesh, i) => {
        mesh.position.copy(cpuBodies[i].position);
        mesh.quaternion.copy(cpuBodies[i].quaternion);
        const hp = Math.max(0, health.cpu[i]);
        if (mesh.userData.healthBar) {
          mesh.userData.healthBar.style.width = `${hp}%`;
        }
      });

      cpuMarbles.forEach((mesh, i) => {
        const label = mesh.userData.label;
        if (label) {
          const labelOffset = new THREE.Vector3(0, 2, 0);
          const labelPos = mesh.getWorldPosition(new THREE.Vector3()).add(labelOffset);
          const vector = labelPos.project(camera);

          if (vector.z < 1) {
          const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-vector.y * 0.5 - 0.5) * window.innerHeight;
                      label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
          } else {
            label.style.transform = 'translate(-9999px, -9999px)';
          }
        }
      });

      controls.update();
      scene.userData.powerups.forEach((pickup) => {
        if (!pickup.userData.active) return;
        const dist = marble.position.distanceTo(pickup.position);
        if (dist < 1.5) {
          if (pickup.userData.type === 'shield') {
            playerShieldActive = true;
            playerShieldTimer = 300; // ~5 seconds
            pickup.visible = false;
            world.removeBody(pickup.userData.body);
            pickup.userData.active = false;
            addKillFeedMessage('Shield activated!');
          }
        }
      });

      // add platform contact
  if (scene.userData.platforms) {
  scene.userData.platforms.forEach((plat) => {
    const pos = plat.position;
    const marbleNear = marble.position.distanceTo(pos) < tileSize / 2 + 1;
    const cpuNear = cpuMarbles.some(m => m.position.distanceTo(pos) < tileSize / 2 + 1);
    const touching = marbleNear || cpuNear;

    if (touching) {
      plat.userData.velocity = 0.05;
    } else {
      plat.userData.velocity = -0.02;
    }

    plat.position.y += plat.userData.velocity;
    if (plat.position.y > plat.userData.startY + 0.3) {
      plat.position.y = plat.userData.startY + 0.3;
      plat.userData.velocity = 0;
    }
    if (plat.position.y < plat.userData.startY) {
      plat.position.y = plat.userData.startY;
      plat.userData.velocity = 0;
    }

    // Move physics body too
    plat.userData.body.position.y = plat.position.y;
  });
}
  
      if (playerShieldActive) {
        marble.material.emissive.set(0x00ffff);
        playerShieldTimer--;
        if (playerShieldTimer <= 0) {
          playerShieldActive = false;
          marble.material.emissive.set(0x000000);
          addKillFeedMessage('Shield expired');
        }
      }

      if (CAMERA_FOLLOW_PLAYER) {
        camera.lookAt(marble.position);
      } else {
        camera.lookAt(0, 0, 0);
      }
      document.getElementById('player-dash-bar').style.width = `${Math.max(0, Math.floor((1 - playerDashCooldown / 180) * 100))}%`;
        // Dash cooldown visual
      const dashBtn = document.getElementById('btn-dash');
      const jumpBtn = document.getElementById('btn-jump');
      if (dashBtn) {
        if (playerDashCooldown > 0) {
          dashBtn.classList.add('cooldown');
          //dashBtn.style.setProperty('--dash-progress', `${(playerDashCooldown / 180).toFixed(2)}`);
          const progress = Math.floor((1 - playerDashCooldown / 180) * 100);
          dashBtn.style.setProperty('--progress', progress + '%');
        } else {
          dashBtn.classList.remove('cooldown');
          dashBtn.style.setProperty('--progress', '100%');
        }
     //   const progress = 1 - playerDashCooldown / 180;
     //   dashBtn.style.setProperty('--progress', progress);
      }
      if (jumpBtn) {
        if (playerJumpCooldown > 0) {
          jumpBtn.classList.add('cooldown');
          const progress = Math.floor((1 - playerJumpCooldown / 180) * 100);
          jumpBtn.style.setProperty('--progress', progress + '%');
        } else {
          jumpBtn.classList.remove('cooldown');
          jumpBtn.style.setProperty('--progress', '100%');
        }
      }
      // Update projectiles
      projectiles = projectiles.filter((proj) => {
        proj.mesh.position.copy(proj.body.position);
        if (proj.body.position.y < -10 || proj.age++ > 300) {
          world.removeBody(proj.body);
          scene.remove(proj.mesh);
          return false;
        }
        
        // Collision detection with CPU marbles
        for (let i = 0; i < cpuBodies.length; i++) {
          const dx = cpuBodies[i].position.x - proj.body.position.x;
          const dy = cpuBodies[i].position.y - proj.body.position.y;
          const dz = cpuBodies[i].position.z - proj.body.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < 1.5 * 1.5) {
            health.cpu[i] -= 10;
            const knock = new CANNON.Vec3(dx, 0.3, dz).scale(5 / Math.sqrt(distSq));
            cpuBodies[i].applyImpulse(knock, cpuBodies[i].position);
            createExplosion(proj.body.position);
            world.removeBody(proj.body);
            scene.remove(proj.mesh);
            return false;
          }
        }
        // Collision of projectile with player marble
        const dxp = marbleBody.position.x - proj.body.position.x;
        const dyp = marbleBody.position.y - proj.body.position.y;
        const dzp = marbleBody.position.z - proj.body.position.z;
        const distSqP = dxp * dxp + dyp * dyp + dzp * dzp;
        if (distSqP < 1.5 * 1.5) {
          if (!playerShieldActive) health.player -= 10;
          createExplosion(proj.body.position);
          world.removeBody(proj.body);
          scene.remove(proj.mesh);
          return false;
        }

        // Collision with environment (walls, platforms, bumps)
        if (proj.body.velocity.lengthSquared() < 0.1 || proj.age > 30) {
          createExplosion(proj.body.position);
          world.removeBody(proj.body);
          scene.remove(proj.mesh);
          return false;
        }
        return true;
      });
        
    // Trigger end of match
    //animationId = requestAnimationFrame(animate);
    const totalCPULives = cpuLives.reduce((a, b) => a + b, 0);
    if (!matchOver && (marbleLives >= 3 || totalCPULives >= 9)) {
      showMatchSummary();
      matchOver = true;
      cancelAnimationFrame(animationId); // stop the loop 
    }  
      if (wireframeEnabled) {
        applyWireframeToScene(true);
        if (cannonDebugger?.update) {
          cannonDebugger.update();
          refreshCannonDebugObjects();
        }
      } else {
        cannonDebugObjects.forEach((obj) => {
          obj.visible = false;
        });
      }
      renderer.render(scene, camera);
    }

    function handleInput() {
      if (matchOver) return;
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      camForward.normalize();
      const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

      // Rotate tilt vector to match camera view
      const rotatedTiltX = tiltForce.x * camRight.x - tiltForce.z * camForward.x;
      const rotatedTiltZ = tiltForce.x * camRight.z - tiltForce.z * camForward.z;
      const alignedTilt = { x: rotatedTiltX, z: rotatedTiltZ };
      const force = 25;
      let appliedForce;
     // if (isMobileDevice()) {
      appliedForce = new CANNON.Vec3(alignedTilt.x * force, 0, alignedTilt.z * force)
      marbleBody.applyForce(appliedForce, marbleBody.position);
      if (appliedForce.lengthSquared() > 0.01) {
        lastInputDirection.copy(appliedForce.unit());
      }
      //}
      
      // handle arrow keys
      let xcoeff = 0;
      let ycoeff = 0;
      if (keys['ArrowUp'])  xcoeff += 1;
      if (keys['ArrowDown'])  xcoeff -= 1;
      if (keys['ArrowLeft'])  ycoeff -= 1;
      if (keys['ArrowRight'])  ycoeff += 1;
      const dirforce = new CANNON.Vec3((camForward.x * xcoeff + camRight.x * ycoeff) * force, 
                                  0, 
                                     (camForward.z * xcoeff + camRight.z * ycoeff) * force);
      marbleBody.applyForce(dirforce, marbleBody.position);
      if (dirforce.lengthSquared() > 0.01) {
        lastInputDirection.copy(dirforce.unit());
      }
      
      if (keys[' '] && playerDashCooldown <= 0) {
        //if (!playerIsDashing) {
        let direction;
        direction = new CANNON.Vec3(
          alignedTilt.x + (keys['ArrowRight'] ? 1 : keys['ArrowLeft'] ? -1 : 0),
              0,
              alignedTilt.z + (keys['ArrowDown'] ? 1 : keys['ArrowUp'] ? -1 : 0));
        
          if (direction.lengthSquared() > 0) {
            direction.normalize();
            //marbleBody.applyImpulse(direction.scale(20), marbleBody.position);
            const dashStrength = marble.userData.suddenDeath ? 35 : 20;
            marbleBody.applyImpulse(direction.scale(dashStrength), marbleBody.position);

            playerIsDashing = true;
            playerDashCooldown = 180; // ~3s cooldown
            createDashEffect(marble.position, 0xff3333);
            setTimeout(() => playerIsDashing = false, 300);
          }
        //} 
      }      
      if (keys['Shift'] && playerJumpCooldown <= 0) {
        marbleBody.applyImpulse(new CANNON.Vec3(0, 10, 0), marbleBody.position);
        playerJumpCooldown = 180;
      }
      
      if (keys['f']) {
        fireProjectile();
        keys['f'] = false;
      } 
    }

    function updateCPU() {
      if (matchOver) return;
      
      const cpuForce = 5;
      cpuBodies.forEach((body, i) => {
        const dx = marbleBody.position.x - body.position.x;
        const dz = marbleBody.position.z - body.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Avoid other CPUs
        let avoidX = 0, avoidZ = 0;
        for (let j = 0; j < cpuBodies.length; j++) {
          if (i === j) continue;
          const other = cpuBodies[j];
          const dxi = other.position.x - body.position.x;
          const dzi = other.position.z - body.position.z;
          const dist = Math.sqrt(dxi * dxi + dzi * dzi);
          if (dist < 5) {
          avoidX -= (dxi / dist) * (5 - dist);
          avoidZ -= (dzi / dist) * (5 - dist);
          }
        }

        // Behavior type
        const behavior = cpuBehaviors[i]; 
        let fx = 0, fz = 0;
        const arenaRadius = 28;
        const edgeMargin = 3;
        const posLength = Math.sqrt(body.position.x ** 2 + body.position.z ** 2);
        if (posLength > arenaRadius - edgeMargin) {
          const awayFromEdge = new CANNON.Vec3(-body.position.x, 0, -body.position.z).unit().scale(cpuForce * 2);
          fx += awayFromEdge.x;
          fz += awayFromEdge.z;
        }
    
        if (behavior === 'aggressive') {
          const playerEdgeDistance = Math.sqrt(marbleBody.position.x ** 2 + marbleBody.position.z ** 2);
          const cpuToEdge = arenaRadius - posLength;
          const nearEdge = playerEdgeDistance > arenaRadius - 6;
          const isBehindPlayer = new CANNON.Vec3(
            marbleBody.position.x - body.position.x,
            0,
            marbleBody.position.z - body.position.z
          ).dot(new CANNON.Vec3(marbleBody.velocity.x, 0, marbleBody.velocity.z)) > 0;
          fx = (dx / distance) * cpuForce;
          fz = (dz / distance) * cpuForce;

          if (nearEdge && isBehindPlayer && distance < 10 && !cpuIsDashing[i]) {
            const impulseDir = new CANNON.Vec3(fx, 0, fz).unit();
            cpuBodies[i].applyImpulse(impulseDir.scale(20), cpuBodies[i].position);
            cpuIsDashing[i] = true;
            createDashEffect(cpuMarbles[i].position, cpuMarbles[i].material.color.getHex());
            setTimeout(() => cpuIsDashing[i] = false, 300);
          }
        } else if (behavior === 'evasive') {
          const attacker = playerIsDashing ? marbleBody : cpuBodies.find((_, j) => j !== i && cpuIsDashing[j]);
          if (attacker) {
            const adx = attacker.position.x - body.position.x;
            const adz = attacker.position.z - body.position.z;
            const perpendicular = Math.random() < 0.5 ? new CANNON.Vec3(-adz, 0, adx) : new CANNON.Vec3(adz, 0, -adx);
            perpendicular.normalize();
            fx = perpendicular.x * cpuForce;
            fz = perpendicular.z * cpuForce;
          } else {
            fx = (-dx / distance) * cpuForce;
            fz = (-dz / distance) * cpuForce;
          }

          const approaching = cpuIsDashing.some((isDashing, j) => {
            if (j === i || !isDashing) return false;
            const attacker = cpuBodies[j];
            const ddx = attacker.position.x - body.position.x;
            const ddz = attacker.position.z - body.position.z;
            const dist = Math.sqrt(ddx * ddx + ddz * ddz);
            return dist < 8;
          }) || (playerIsDashing && marbleBody.position.distanceTo(body.position) < 8);

          if (approaching && cpuJumpCooldown[i] <= 0) {
            body.applyImpulse(new CANNON.Vec3(0, 10, 0), body.position);
            cpuJumpCooldown[i] = 180;
          }
        } else if (behavior === 'chaotic') {
          fx = (Math.random() - 0.5) * cpuForce * 2;
          fz = (Math.random() - 0.5) * cpuForce * 2;
        }

        fx += avoidX;
        fz += avoidZ;

        body.applyForce(new CANNON.Vec3(fx, 0, fz), body.position);
        // Dash chance (simple trigger)
        if (!cpuIsDashing[i] && Math.random() < 0.01) {
          const dir = new CANNON.Vec3(fx, 0, fz).unit();
          //body.applyImpulse(dir.scale(20), body.position);
          const impulseStrength = cpuMarbles[i].userData.suddenDeath ? 35 : 20;
          body.applyImpulse(dir.scale(impulseStrength), body.position);

          cpuIsDashing[i] = true;
          createDashEffect(cpuMarbles[i].position, cpuMarbles[i].material.color.getHex());
          setTimeout(() => cpuIsDashing[i] = false, 300);
        }
      });
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
