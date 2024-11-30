import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gsap } from "https://cdn.skypack.dev/gsap@3.12.5";
import * as dat from "https://cdn.jsdelivr.net/npm/lil-gui@0.16.0/dist/lil-gui.esm.min.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const bench = new GLTFLoader();
bench.load("./Models/Bench1/scene.gltf", (gltf) => {
  const bench = gltf.scene;

  // Set position
  bench.position.set(0, 0, -7.5); // X, Y, Z coordinates

  // Optional: Set scale
  bench.scale.set(1.5, 1.5, 1.5); // Scale uniformly to half the size

  bench.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true; // Cast shadows
      node.receiveShadow = true; // Receive shadows
    }
  });

  // Add to the scene
  scene.add(bench);
});

const lamp = new GLTFLoader();
lamp.load("./Models/Lamp/scene.gltf", (gltf) => {
  const lamp = gltf.scene;

  lamp.position.set(-7.5, 0, -8.8);

  lamp.scale.set(1.5, 1.5, 1.5);

  scene.add(lamp);
});

const trashCan = new GLTFLoader();
trashCan.load("./Models/Trash can/scene.gltf", (gltf) => {
  const can = gltf.scene;

  can.position.set(7.5, 0, -8.8);

  can.scale.set(2, 2, 2);

  scene.add(can);
});

const hedge = new GLTFLoader();
hedge.load("./Models/Hedge/scene.gltf", (gltf) => {
  const hedge = gltf.scene;

  hedge.position.set(0, -0.5, -11);

  //   hedge.scale.set(0, 0, 15)

  scene.add(hedge);
});

const foxLoader = new GLTFLoader();
let mixer = null; // Declare mixer globally
foxLoader.load("./models/Fox/glTF/Fox.gltf", (gltf) => {
  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true; // Cast shadows
      node.receiveShadow = true; // Receive shadows
    }
  });
  gltf.scene.scale.set(0.025, 0.025, 0.025);
  scene.add(gltf.scene);

  mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(gltf.animations[0]);
  action.play();
});

// Texture Loader
const textureLoader = new THREE.TextureLoader();

// Grass Texture
const grassTextures = {
  color: textureLoader.load("./Textures/grass/color.jpg"),
  ao: textureLoader.load("./Textures/grass/ambientOcclusion.jpg"),
  normal: textureLoader.load("./Textures/grass/normal.jpg"),
  roughness: textureLoader.load("./Textures/grass/roughness.jpg"),
};
const starParticle = textureLoader.load("./Textures/particles/1.png");
const rainParticle = textureLoader.load("./Textures/particles/2.png");

let gui, canvas, scene, camera, sizes, controls, renderer;

// Physics
let world, defaultMaterial, defaultContactMaterial;

let objectsToUpdate = [];
let debugObject = {};

// Ball
let sphereGeometry, sphereMaterial;

let createSphere, mesh, shape, body;

// Floor
let floor, floorShape, floorBody;

let stars;

// Lights
let ambientLight, dayAndNightLight;

// Rain
let rain, rainGeometry, rainMaterial, rainCount, rainPositions, rainSpeeds;

let rainDensity = 1000;

let clock = new THREE.Clock();
let currentMode = "day"; // Default mode
let previousTime = 0;

init();

function init() {
  GUIs();

  // Canvas
  canvas = document.querySelector("canvas.webgl");

  // Scene
  scene = new THREE.Scene();

  scene.background = new THREE.Color("#a9f1f6"); // Light blue sky color

  world = new CANNON.World();
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.gravity.set(0, -9.82, 0);
  defaultMaterial = new CANNON.Material("default");

  defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMaterial,
    defaultMaterial,
    {
      friction: 0.1,
      restitution: 0.7,
    }
  );
  world.addContactMaterial(defaultContactMaterial);

  world.defaultContactMaterial = defaultContactMaterial;

  objectsToUpdate = [];

  // Create a spare (extra) sphere mesh (as a placeholder for a spare object)
  sphereGeometry = new THREE.SphereGeometry(1, 20, 20);
  sphereMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.3,
    roughness: 0.4,
    //   envMap: environmentMapTexture,
    envMapIntensity: 0.5,
  });

  createSphere = (radius, position) => {
    // Three.js mesh
    mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    mesh.castShadow = true;
    mesh.scale.set(radius, radius, radius);
    mesh.position.copy(position);
    scene.add(mesh);

    // Cannon.js body
    shape = new CANNON.Sphere(radius);
    body = new CANNON.Body({
      mass: 1,
      position: new CANNON.Vec3(0, 3, 0),
      shape: shape,
      material: defaultMaterial,
    });
    body.position.copy(position);
    // body.addEventListener("collide", playHitSound);
    world.addBody(body);

    // Save in objects to update
    objectsToUpdate.push({ mesh, body });
  };

  floorShape = new CANNON.Plane();
  floorBody = new CANNON.Body();
  // floorBody.material = defaultMaterial;
  floorBody.mass = 0;
  floorBody.addShape(floorShape);
  floorBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(-1, 0, 0),
    Math.PI * 0.5
  );
  world.addBody(floorBody);

  // Floor
  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({
      map: grassTextures.color,
      aoMap: grassTextures.ao,
      normalMap: grassTextures.normal,
      roughnessMap: grassTextures.roughness,
    })
  );
  floor.geometry.setAttribute(
    "uv2",
    new THREE.Float32BufferAttribute(floor.geometry.attributes.uv.array, 2)
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ambient light
  ambientLight = new THREE.AmbientLight("#b9d5ff", 1);
  scene.add(ambientLight);

  dayAndNightLight = new THREE.DirectionalLight("#ffffff", 1.5); // Brighter directional light
  dayAndNightLight.position.set(0, 10, 25); // Simulate sun high in the sky
  dayAndNightLight.castShadow = true; // Enable shadows
  dayAndNightLight.shadow.mapSize.set(256, 256); // Improve shadow quality
  dayAndNightLight.shadow.camera.near = 1;
  dayAndNightLight.shadow.camera.far = 50;
  dayAndNightLight.shadow.camera.left = -10;
  dayAndNightLight.shadow.camera.right = 10;
  dayAndNightLight.shadow.camera.top = 10;
  dayAndNightLight.shadow.camera.bottom = -10;
  scene.add(dayAndNightLight);

  const directionalLightCameraHelper = new THREE.CameraHelper(
    dayAndNightLight.shadow.camera
  );
  directionalLightCameraHelper.visible = true;
  // scene.add(directionalLightCameraHelper);

  createStars();

  sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  window.addEventListener("resize", () => {
    // Update sizes
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    sizes.width / sizes.height,
    0.1,
    100
  );
  camera.position.set(10, 5.5, 10);
  scene.add(camera);

  // Controls
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  createRain();
  animate();
}

function GUIs() {
  gui = new dat.GUI();
  gui.add({ toggle: toggleDayNight }, "toggle").name("Day/Night");

  debugObject.createSphere = () => {
    createSphere(0.5, {
      x: (Math.random() - 0.5) * 3,
      y: 3,
      z: (Math.random() - 0.5) * 3,
    });
  };

  gui.add(debugObject, "createSphere").name("Create Sphere");

  debugObject.reset = () => {
    for (const object of objectsToUpdate) {
      // Remove body
      //   object.body.removeEventListener("collide", playHitSound);

      world.removeBody(object.body);

      scene.remove(object.mesh);
    }

    objectsToUpdate.splice(0, objectsToUpdate.length);
  };

  gui.add(debugObject, "reset").name("Delete sphere");

  debugObject.toggleRain = () => {
    rain.visible = !rain.visible;
  };

  gui.add(debugObject, "toggleRain").name("Rain");
}

function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 1000; // Number of stars
  const positions = [];

  // Create random positions for the stars
  for (let i = 0; i < starCount; i++) {
    positions.push(
      Math.random() * 200 - 100, // Random X position
      Math.random() * 200 - 100, // Random Y position
      Math.random() * 200 - 100 // Random Z position
    );
  }

  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  // Create material for the stars
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff, // White color
    size: 2, // Size of the stars
    opacity: 0.8, // Opacity
    transparent: true, // Make it transparent
    alphaMap: starParticle,
    // alphaTest: 0.001,
    // depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // vertexColors: true,
  });

  // Create the points (particles) and add to the scene
  stars = new THREE.Points(starGeometry, starMaterial);
  stars.visible = false; // Ensure stars are hidden initially
  scene.add(stars);
}

function toggleDayNight() {
  if (currentMode === "day") {
    currentMode = "night";

    // Animate the directional light to a dimmer and cooler tone
    gsap.to(dayAndNightLight.color, { r: 0.0, g: 0.0, b: 0.0, duration: 2 }); // Black
    gsap.to(dayAndNightLight, { intensity: 0.3, duration: 2 }); // Dimmer light

    // Ambient light changes
    gsap.to(ambientLight.color, { r: 0.1, g: 0.1, b: 0.1, duration: 2 }); // Dim ambient light
    gsap.to(ambientLight, { intensity: 2, duration: 2 }); // Reduced intensity

    // Scene background to black
    gsap.to(scene.background, { r: 0.0, g: 0.0, b: 0.0, duration: 2 }); // Black background

    // Show the stars
    stars.visible = true; // Make stars visible
  } else {
    currentMode = "day";

    // Animate the directional light to a brighter and warmer tone
    gsap.to(dayAndNightLight.color, { r: 1.0, g: 1.0, b: 1.0, duration: 2 }); // Bright white
    gsap.to(dayAndNightLight, { intensity: 1.5, duration: 2 }); // Full brightness

    // Ambient light changes
    gsap.to(ambientLight.color, { r: 0.73, g: 0.84, b: 1.0, duration: 2 }); // Soft daylight color
    gsap.to(ambientLight, { intensity: 1.0, duration: 2 }); // Normal intensity

    // Scene background to light blue
    gsap.to(scene.background, { r: 0.53, g: 0.81, b: 0.93, duration: 2 }); // Light blue background

    // Hide the stars
    stars.visible = false; // Hide stars during the day
  }
}

// Function to create the rain effect
function createRain() {
  rainCount = 1000; // Number of raindrops
  rainGeometry = new THREE.BufferGeometry();
  rainPositions = new Float32Array(rainCount * 3); // Each raindrop has x, y, z
  rainSpeeds = new Float32Array(rainCount); // Each raindrop has a speed

  for (let i = 0; i < rainCount; i++) {
    // Generate random positions within the plane boundaries
    rainPositions[i * 3] = Math.random() * 20 - 10; // X: -10 to 10
    rainPositions[i * 3 + 1] = Math.random() * 10 + 5; // Y: 5 to 15
    rainPositions[i * 3 + 2] = Math.random() * 20 - 10; // Z: -10 to 10

    // Assign random fall speed
    rainSpeeds[i] = Math.random() * 0.2 + 0.1; // Speed: 0.1 to 0.3
  }

  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3)
  );

  // Create material for raindrops
  rainMaterial = new THREE.PointsMaterial({
    color: 0x88ccee, // Light blue
    size: 0.2, // Size of raindrops
    transparent: true,
    alphaMap: rainParticle,
    opacity: 0.8,
  });

  // Create the Points object for rain
  rain = new THREE.Points(rainGeometry, rainMaterial);
  rain.visible = false; // Initially hide the rain
  scene.add(rain);
}

// Update rain positions (animation)
function updateRain() {
  if (!rain.visible) return;

  const positions = rain.geometry.attributes.position.array;

  for (let i = 0; i < rainCount; i++) {
    // Update Y position
    positions[i * 3 + 1] -= rainSpeeds[i];

    // Reset position if below floor
    if (positions[i * 3 + 1] < 0) {
      positions[i * 3 + 1] = Math.random() * 10 + 5; // Y: 5 to 15
      positions[i * 3] = Math.random() * 20 - 10; // X: -10 to 10
      positions[i * 3 + 2] = Math.random() * 20 - 10; // Z: -10 to 10
    }
  }

  // Update the geometry
  rain.geometry.attributes.position.needsUpdate = true;
}

function animate() {
  // This is your main animation loop
  const elapsedTime = clock.getElapsedTime();

  const deltaTime = elapsedTime - previousTime;
  previousTime = elapsedTime;

  // Update AnimationMixer
  if (mixer) {
    mixer.update(deltaTime);
  }

  // Update physics
  world.step(1 / 60, deltaTime, 3);
  for (const object of objectsToUpdate) {
    object.mesh.position.copy(object.body.position);
    object.mesh.quaternion.copy(object.body.quaternion);
  }

  // Update controls
  controls.update();

  // Update rain animation
  updateRain();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(animate);
}
