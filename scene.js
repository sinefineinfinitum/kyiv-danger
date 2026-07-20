import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('canvas-container');
export const loadBar = document.getElementById('loadBar');
export const loadingDiv = document.getElementById('loading');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.FogExp2(0x0d1117, 0.0003);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 50000);
camera.position.set(200, 200, 200);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.4;
controls.zoomSpeed = 0.5;
controls.panSpeed = 0.5;
controls.minDistance = 2;
controls.maxDistance = 5000;
controls.maxPolarAngle = Math.PI / 2 - 0.01;
controls.target.set(0, 0, 0);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x223322, 0.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 4.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 15000;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.02;
sunLight.shadow.radius = 1;
scene.add(sunLight);
scene.add(sunLight.target);

const groundGeo = new THREE.PlaneGeometry(50000, 50000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2d, roughness: 0.95, metalness: 0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(2000, 40, 0x58a6ff, 0x30363d);
gridHelper.position.y = 0.1;
scene.add(gridHelper);

export const buildingMeshes = [];
export let sceneCenter = new THREE.Vector3(0, 0, 0);
export let sceneSize = 500;
export let sceneBounds3 = null;
export let unitsPerMeter = 1;

export const DEG = Math.PI / 180;
export const _up = new THREE.Vector3(0, 1, 0);

export function setSceneCenter(v) { sceneCenter.copy(v); }
export function setSceneSize(s) { sceneSize = s; }
export function setSceneBounds3(b) { sceneBounds3 = b ? b.clone() : null; }
export function expandSceneBounds3(min, max) {
    if (!sceneBounds3) { sceneBounds3 = new THREE.Box3(min.clone(), max.clone()); return; }
    sceneBounds3.expandByPoint(min);
    sceneBounds3.expandByPoint(max);
}
export function setUnitsPerMeter(u) { unitsPerMeter = u; }
export function getContainer() { return container; }

export function updateSunPosition() {
    sunLight.position.set(sceneCenter.x, sceneCenter.y + sceneSize * 2, sceneCenter.z + sceneSize * 0.5);
    sunLight.target.position.copy(sceneCenter);
    const lightDist = sunLight.position.distanceTo(sunLight.target.position);
    const d = sceneSize * 0.5;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = Math.max(0.5, lightDist - sceneSize * 0.8);
    sunLight.shadow.camera.far = lightDist + sceneSize * 0.8;
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.needsUpdate = true;
}

export function setupCamera(pos, target) {
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
}

export { camera, controls, scene, renderer, ground, container };

window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

controls.addEventListener('change', () => {
    localStorage.setItem('camera', JSON.stringify({
        px: camera.position.x, py: camera.position.y, pz: camera.position.z,
        tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
    }));
});
