import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeDirectionScores, renderDirectionDiagram } from './direction-diagram.js';

const OSM_API = 'https://overpass.kumi.systems/api/interpreter';
const OSM_FALLBACK_API = 'https://overpass-api.de/api/interpreter';
const OSM_BBOX = '50.447,30.518,50.453,30.530';
const LOCAL_BUILDINGS_URL = 'data/buildings.json';

const container = document.getElementById('canvas-container');
const loadBar = document.getElementById('loadBar');
const loadingDiv = document.getElementById('loading');
const facadeInfoEl = document.getElementById('facade-info');
const facadeInfoBody = document.getElementById('facade-info-body');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const I = window.I18N;

const ATTACK_TYPES = [
    { key: 'drone',     color: '#f0883e', label: I.drone,        angle: 10, weight: 1.0 },
    { key: 'missile',   color: '#58a6ff', label: I.missile,     angle: 40, weight: 1.5 },
    { key: 'ballistic', color: '#f85149', label: I.ballistic, angle: 60, weight: 2.0 }
];

// ── Renderer ───────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// ── Scene & Camera ─────────────────────────────────────

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

// ── Lighting ───────────────────────────────────────────

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x223322, 0.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
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

// ── Ground ─────────────────────────────────────────────

const groundGeo = new THREE.PlaneGeometry(50000, 50000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.95, metalness: 0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ── State ──────────────────────────────────────────────

let sceneCenter = new THREE.Vector3(0, 0, 0);
let sceneSize = 500;
let sceneBounds3 = null;
let buildingMeshes = [];
let cityAvgDanger = 0;
let unitsPerMeter = 1;
let cityAvgSamples = [];
let loadedBounds = null;

const DEG = Math.PI / 180;
const occlusionRaycaster = new THREE.Raycaster();

// ── Temp vector pool (reduce GC in hot functions) ──────

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _box = new THREE.Box3();
const _up = new THREE.Vector3(0, 1, 0);
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _attackDir = new THREE.Vector3();
const _colorGreen = new THREE.Color(0x3fb950);
const _colorRed = new THREE.Color(0xf85149);
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

// ── Sun ────────────────────────────────────────────────

function updateSunPosition() {
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

// ── Exposure Math ──────────────────────────────────────

function readTypeParams(type) {
    const countEl = document.getElementById(`${type}-count`);
    const azEl = document.getElementById(`${type}-az`);
    let count = parseInt(countEl.value, 10);
    let azDeg = parseFloat(azEl.value);
    if (isNaN(count) || count < 0) { count = 0; countEl.value = 0; }
    if (count > 50) { count = 50; countEl.value = 50; }
    if (isNaN(azDeg)) { azDeg = 0; azEl.value = 0; }
    azDeg = Math.max(0, Math.min(359, Math.round(azDeg)));
    if (parseFloat(azEl.value) !== azDeg) azEl.value = azDeg;
    return { count, az: azDeg * DEG };
}

function isBlocked(origin, dir, facadePoint, facadeNormal) {
    occlusionRaycaster.set(origin, dir);
    occlusionRaycaster.near = 0;
    occlusionRaycaster.far = 500 * unitsPerMeter;
    const hits = occlusionRaycaster.intersectObjects(buildingMeshes, false);
    const selfThreshold = 3 * unitsPerMeter;
    return hits.some(h => {
        _v.subVectors(h.point, facadePoint);
        return Math.abs(_v.dot(facadeNormal)) >= selfThreshold;
    });
}

function getFacadeBasis(normal) {
    if (Math.abs(normal.dot(_up)) > 0.99) {
        _tangent.set(1, 0, 0);
    } else {
        _tangent.crossVectors(_up, normal).normalize();
    }
    _bitangent.crossVectors(normal, _tangent).normalize();
    return { tangent: _tangent, bitangent: _bitangent };
}

function computeAdaptiveHalf(point, tangent, bitangent, mesh) {
    const maxHalf = 5 * unitsPerMeter;
    if (!mesh) return maxHalf;
    _box.setFromObject(mesh);
    let maxT = 0, maxB = 0;
    const { min, max } = _box;
    for (const cx of [min.x, max.x]) {
        for (const cy of [min.y, max.y]) {
            for (const cz of [min.z, max.z]) {
                _v3.set(cx, cy, cz).sub(point);
                maxT = Math.max(maxT, Math.abs(_v3.dot(tangent)));
                maxB = Math.max(maxB, Math.abs(_v3.dot(bitangent)));
            }
        }
    }
    return Math.min(maxHalf, maxT * 0.9, maxB * 0.9);
}

function computeExposure(point, normal, mesh) {
    const { tangent, bitangent } = getFacadeBasis(normal);
    const half = computeAdaptiveHalf(point, tangent, bitangent, mesh);
    _corners[0].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, half);
    _corners[1].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, -half);
    _corners[2].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, half);
    _corners[3].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, -half);
    const result = {};

    for (const t of ATTACK_TYPES) {
        const { count, az } = readTypeParams(t.key);
        if (count === 0) {
            result[t.key] = { open: false, exposure: 0, weight: t.weight, count: 0, angle: t.angle };
            continue;
        }
        const alpha = t.angle * DEG;
        _attackDir.set(
            -Math.cos(alpha) * Math.sin(az),
            Math.sin(alpha),
            Math.cos(alpha) * Math.cos(az)
        );
        const facingDot = normal.dot(_attackDir);
        if (facingDot <= 0) {
            result[t.key] = { open: false, exposure: 0, weight: t.weight, count, angle: t.angle, azDeg: (az / DEG).toFixed(0), blockedCount: 4 };
            continue;
        }
        let blockedCount = 0;
        for (const corner of _corners) {
            _v2.copy(corner).addScaledVector(normal, 0.1 * unitsPerMeter);
            if (isBlocked(_v2, _attackDir, point, normal)) blockedCount++;
        }
        const openCount = 4 - blockedCount;
        const exposure = (openCount / 4) * facingDot;
        result[t.key] = {
            open: exposure > 0,
            exposure,
            weight: t.weight,
            count,
            angle: t.angle,
            azDeg: (az / DEG).toFixed(0),
            blockedCount
        };
    }
    return result;
}

function dangerScore(exposure) {
    let wSum = 0, wTotal = 0;
    for (const t of ATTACK_TYPES) {
        const e = exposure[t.key];
        if (e.count === 0) continue;
        const w = e.count * e.weight;
        const angleFactor = Math.sin(e.angle * DEG);
        wSum += e.exposure * w * angleFactor;
        wTotal += w * angleFactor;
    }
    return wTotal > 0 ? wSum / wTotal : 0;
}

// ── City Sampling ──────────────────────────────────────

function buildCitySamples() {
    cityAvgSamples = [];
    if (buildingMeshes.length === 0) return;

    const bboxes = buildingMeshes.map(m => {
        const b = new THREE.Box3().setFromObject(m);
        return { mesh: m, box: b, center: b.getCenter(new THREE.Vector3()) };
    });

    bboxes.sort((a, b) => a.center.distanceTo(sceneCenter) - b.center.distanceTo(sceneCenter));

    const minDist = (sceneBounds3.max.x - sceneBounds3.min.x) * 0.15;
    const selected = [];
    for (const b of bboxes) {
        if (selected.length >= 10) break;
        if (selected.some(s => b.center.distanceTo(s.center) < minDist)) continue;
        selected.push(b);
    }

    const dirVecs = [
        { dir: new THREE.Vector3(1, 0, 0), face: 'maxX' },
        { dir: new THREE.Vector3(-1, 0, 0), face: 'minX' },
        { dir: new THREE.Vector3(0, 0, 1), face: 'maxZ' },
        { dir: new THREE.Vector3(0, 0, -1), face: 'minZ' },
    ];

    for (const b of selected) {
        const box = b.box;
        const yMid = (box.min.y + box.max.y) / 2;
        for (const { dir, face } of dirVecs) {
            const center = new THREE.Vector3();
            if (face === 'maxX') center.set(box.max.x, yMid, b.center.z);
            else if (face === 'minX') center.set(box.min.x, yMid, b.center.z);
            else if (face === 'maxZ') center.set(b.center.x, yMid, box.max.z);
            else center.set(b.center.x, yMid, box.min.z);
            cityAvgSamples.push({ center, normal: dir.clone() });
        }
    }
}

function computeCityAverage() {
    let sum = 0;
    for (const patch of cityAvgSamples) {
        const exp = computeExposure(patch.center, patch.normal, null);
        sum += dangerScore(exp);
    }
    cityAvgDanger = cityAvgSamples.length > 0 ? sum / cityAvgSamples.length : 0.001;
}

// ── UI Sync ────────────────────────────────────────────

function rebuildAttacks() {
    let total = 0;
    for (const t of ATTACK_TYPES) {
        const el = document.getElementById(`${t.key}-count`);
        let count = parseInt(el.value, 10);
        if (isNaN(count) || count < 0) { count = 0; el.value = 0; }
        if (count > 50) { count = 50; el.value = 50; }
        document.getElementById(`${t.key}-badge`).textContent = count;
        total += count;
    }
    document.getElementById('summary').innerHTML = `${I.totalObjects}: <strong>${total}</strong>`;
    computeCityAverage();
    if (currentHighlight) updateFacadeInfo(currentHighlight.point, currentHighlight.normal, currentHighlight.mesh);
}
window.rebuildAttacks = rebuildAttacks;

['drone', 'missile', 'ballistic'].forEach(type => {
    ['count', 'az'].forEach(param => {
        document.getElementById(`${type}-${param}`).addEventListener('input', rebuildAttacks);
    });
});

// ── OSM Building Generation ──────────────────────────

const BUILDING_COLORS = {
    residential: 0x5a6a7a,
    apartment: 0x5a7a8a,
    house: 0x6a7a5a,
    commercial: 0x5a7a8a,
    retail: 0x6a7a7a,
    industrial: 0x6a6a5a,
    warehouse: 0x7a7a6a,
    office: 0x5a6a8a,
    hotel: 0x6a7a9a,
    school: 0x7a6a7a,
    university: 0x6a6a8a,
    hospital: 0x8a6a6a,
    church: 0x7a6a5a,
    default: 0x6a7a7a
};

function latLngToMeters(lat, lng) {
    const dLat = lat - KYIV_CENTER_LAT;
    const dLng = lng - KYIV_CENTER_LNG;
    const cosLat = Math.cos(KYIV_CENTER_LAT * Math.PI / 180);
    const metersNorth = dLat * 111320;
    const metersEast = dLng * (111320 * cosLat);
    return { x: metersEast, z: -metersNorth };
}

function osmHeight(tags) {
    if (tags.height) {
        const h = parseFloat(tags.height);
        if (!isNaN(h) && h > 0 && h < 200) return h;
    }
    const levels = tags['building:levels'];
    if (levels) {
        const n = parseInt(levels, 10);
        if (!isNaN(n) && n > 0 && n < 100) return n * 3;
    }
    const ul = tags['building:levels:aboveground'];
    if (ul) {
        const n = parseInt(ul, 10);
        if (!isNaN(n) && n > 0 && n < 100) return n * 3;
    }
    return 3;
}

function osmBuildingType(tags) {
    const t = tags.building;
    if (BUILDING_COLORS[t]) return t;
    return 'default';
}

function osmWayToMesh(way) {
    if (!way.geometry || way.geometry.length < 3) return null;

    const coords = way.geometry.map(p => latLngToMeters(p.lat, p.lon));

    const shape = new THREE.Shape();
    shape.moveTo(coords[0].x, -coords[0].z);
    for (let i = 1; i < coords.length; i++) {
        shape.lineTo(coords[i].x, -coords[i].z);
    }

    const height = osmHeight(way.tags || {});
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    const type = osmBuildingType(way.tags || {});
    const mat = new THREE.MeshStandardMaterial({
        color: BUILDING_COLORS[type],
        roughness: 0.85,
        metalness: 0.1,
        shadowSide: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

async function tryLoadOSMBuildings(bbox) {
    const query = `[out:json][timeout:300][maxsize:1073741824][bbox:${bbox || OSM_BBOX}];
(way["building"];);
out geom;`;

    const urls = [OSM_API, OSM_FALLBACK_API];
    let lastErr;
    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 180000);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(query),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (err) {
            lastErr = err;
            console.warn('Overpass attempt failed for ' + url, err.message);
        }
    }
    throw lastErr;
}

function initSceneFromOSMBuildings(buildingGroup) {
    scene.add(buildingGroup);

    const box = new THREE.Box3().setFromObject(buildingGroup);
    box.getCenter(sceneCenter);
    sceneSize = box.getSize(new THREE.Vector3()).length();
    sceneBounds3 = box.clone();
    unitsPerMeter = 1;

    ground.position.y = box.min.y - 0.5;

    const saved = localStorage.getItem('camera');
    if (saved) {
        try {
            const c = JSON.parse(saved);
            camera.position.set(c.px, c.py, c.pz);
            controls.target.set(c.tx, c.ty, c.tz);
        } catch(e) {}
    } else {
        camera.position.set(sceneCenter.x + sceneSize * 0.4, sceneCenter.y + sceneSize * 0.3, sceneCenter.z + sceneSize * 0.4);
        controls.target.copy(sceneCenter);
    }
    controls.update();
    updateSunPosition();
}

// ── OSM Loading ──────────────────────────────────────

function createMeshesFromOSMData(data) {
    const group = new THREE.Group();
    let count = 0;
    for (const el of data.elements) {
        if (el.type === 'way' && el.geometry) {
            const mesh = osmWayToMesh(el);
            if (mesh) {
                group.add(mesh);
                buildingMeshes.push(mesh);
                count++;
            }
        }
    }
    return { group, count };
}

async function ensureBuildingsAt(lat, lng) {
    if (loadedBounds && lat >= loadedBounds.minLat && lat <= loadedBounds.maxLat &&
        lng >= loadedBounds.minLng && lng <= loadedBounds.maxLng) return;

    const dLat = 0.009;
    const dLng = 0.014;
    const minLat = Math.min(lat - dLat, loadedBounds?.minLat ?? lat);
    const maxLat = Math.max(lat + dLat, loadedBounds?.maxLat ?? lat);
    const minLng = Math.min(lng - dLng, loadedBounds?.minLng ?? lng);
    const maxLng = Math.max(lng + dLng, loadedBounds?.maxLng ?? lng);
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

    try {
        const data = await tryLoadOSMBuildings(bbox);
        const { group, count } = createMeshesFromOSMData(data);
        if (count === 0) return;
        scene.add(group);

        const box = new THREE.Box3().setFromObject(group);
        sceneBounds3.expandByPoint(box.min).expandByPoint(box.max);
        sceneBounds3.getCenter(sceneCenter);
        sceneSize = sceneBounds3.getSize(new THREE.Vector3()).length();

        loadedBounds = {
            minLat: Math.min(loadedBounds?.minLat ?? minLat, minLat),
            maxLat: Math.max(loadedBounds?.maxLat ?? maxLat, maxLat),
            minLng: Math.min(loadedBounds?.minLng ?? minLng, minLng),
            maxLng: Math.max(loadedBounds?.maxLng ?? maxLng, maxLng)
        };

        buildCitySamples();
        computeCityAverage();
        if (currentHighlight) updateFacadeInfo(currentHighlight.point, currentHighlight.normal, currentHighlight.mesh);
    } catch (err) {
        console.warn('Failed to load buildings at', lat, lng, err.message);
    }
}

async function tryLoadLocalBuildings() {
    const res = await fetch(LOCAL_BUILDINGS_URL);
    if (!res.ok) throw new Error('Local file not found');
    return await res.json();
}

async function initFromOSM() {
    try {
        let data;
        try {
            data = await tryLoadLocalBuildings();
        } catch {
            console.warn('Local file failed, trying Overpass API...');
            data = await tryLoadOSMBuildings();
        }
        const { group, count } = createMeshesFromOSMData(data);
        if (count === 0) throw new Error('No buildings found');
        initSceneFromOSMBuildings(group);
        buildCitySamples();
        rebuildAttacks();
        const [minLat, minLng, maxLat, maxLng] = OSM_BBOX.split(',').map(Number);
        loadedBounds = { minLat, minLng, maxLat, maxLng };
        loadingDiv.style.display = 'none';
    } catch (err) {
        console.error('OSM error:', err);
        loadingDiv.textContent = I.loadError + ': ' + err.message;
    }
}

initFromOSM();

// ── Danger Colors ──────────────────────────────────────

function smoothDangerColor(ratio) {
    const t = Math.max(0, Math.min(ratio, 2)) / 2;
    const r = Math.round(63 + 185 * t);
    const g = Math.round(185 - 130 * t);
    const b = Math.round(80 - 31 * t);
    return `rgb(${r},${g},${b})`;
}



// ── Highlight & Facade Info ────────────────────────────

let highlightMesh = null;
let highlightExtras = [];
let currentHighlight = null;

function removeHighlight() {
    if (highlightMesh) {
        scene.remove(highlightMesh);
        highlightMesh.geometry.dispose();
        highlightMesh.material.dispose();
        highlightMesh = null;
    }
    for (const o of highlightExtras) {
        scene.remove(o);
        if (o.type === 'Group') {
            o.traverse(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
        } else {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        }
    }
    highlightExtras = [];
}

function createFacadeHighlight(point, normal) {
    removeHighlight();
    const size = 10 * unitsPerMeter;
    const gridStep = 2 * unitsPerMeter;

    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false
    });
    highlightMesh = new THREE.Mesh(geo, mat);
    highlightMesh.position.copy(point).addScaledVector(normal, 0.3 * unitsPerMeter);
    _v4.copy(point).add(normal);
    highlightMesh.lookAt(_v4);
    highlightMesh.userData.isImpact = true;
    scene.add(highlightMesh);

    const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: true });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.copy(highlightMesh.position);
    wireframe.quaternion.copy(highlightMesh.quaternion);
    wireframe.userData.isImpact = true;
    scene.add(wireframe);
    highlightExtras.push(wireframe);

    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    for (let i = -size / 2; i <= size / 2; i += gridStep) {
        const pts1 = [
            new THREE.Vector3().addScaledVector(new THREE.Vector3(1, 0, 0), i).addScaledVector(new THREE.Vector3(0, 1, 0), -size / 2),
            new THREE.Vector3().addScaledVector(new THREE.Vector3(1, 0, 0), i).addScaledVector(new THREE.Vector3(0, 1, 0), size / 2)
        ];
        const pts2 = [
            new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 1, 0), i).addScaledVector(new THREE.Vector3(1, 0, 0), -size / 2),
            new THREE.Vector3().addScaledVector(new THREE.Vector3(0, 1, 0), i).addScaledVector(new THREE.Vector3(1, 0, 0), size / 2)
        ];
        [pts1, pts2].forEach(pts => {
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            gridGroup.add(new THREE.Line(g, gridMat));
        });
    }
    gridGroup.position.copy(point).addScaledVector(normal, 0.35 * unitsPerMeter);
    const { tangent, bitangent } = getFacadeBasis(normal);
    const m4 = new THREE.Matrix4().makeBasis(tangent, bitangent, normal);
    gridGroup.quaternion.setFromRotationMatrix(m4);
    gridGroup.userData.isImpact = true;
    scene.add(gridGroup);
    highlightExtras.push(gridGroup);
}

function createDirectionRays(point, normal, exposure, mesh) {
    const { tangent, bitangent } = getFacadeBasis(normal);
    const half = computeAdaptiveHalf(point, tangent, bitangent, mesh);
    _corners[0].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, half);
    _corners[1].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, -half);
    _corners[2].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, half);
    _corners[3].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, -half);
    const rayLen = 500 * unitsPerMeter;

    for (const t of ATTACK_TYPES) {
        const e = exposure[t.key];
        if (e.count === 0) continue;

        const { az } = readTypeParams(t.key);
        const srcAz = az + Math.PI;
        const alpha = t.angle * DEG;
        _attackDir.set(
            -Math.cos(alpha) * Math.sin(srcAz),
            Math.sin(alpha),
            Math.cos(alpha) * Math.cos(srcAz)
        );

        for (const corner of _corners) {
            _v2.copy(corner).addScaledVector(normal, 0.1 * unitsPerMeter);
            const blocked = isBlocked(_v2, _attackDir, point, normal);
            const c = blocked ? _colorGreen : _colorRed;
            _v4.copy(_v2).addScaledVector(_attackDir, rayLen);
            const g = new THREE.BufferGeometry().setFromPoints([_v2, _v4]);
            const m = new THREE.LineBasicMaterial({ color: c.clone(), transparent: true, opacity: 0.7, depthTest: true });
            const line = new THREE.Line(g, m);
            line.userData.isImpact = true;
            scene.add(line);
            highlightExtras.push(line);
        }
    }
}

function updateFacadeInfo(point, normal, mesh) {
    currentHighlight = { point: point.clone(), normal: normal.clone(), mesh };
    createFacadeHighlight(point, normal);

    const exposure = computeExposure(point, normal, mesh);
    createDirectionRays(point, normal, exposure, mesh);

    const score = dangerScore(exposure);
    const ratio = cityAvgDanger > 0 ? score / cityAvgDanger : 1;
    const ratioPct = (ratio * 100).toFixed(0);
    const color = smoothDangerColor(ratio);

    let perType = '';
    for (const t of ATTACK_TYPES) {
        const e = exposure[t.key];
        if (e.count === 0) continue;
        const openCount = 4 - e.blockedCount;
        const pct = (e.exposure * 100).toFixed(0);
        const statusColor = e.exposure === 0 ? '#3fb950' : e.exposure < 1 ? '#f0883e' : '#f85149';
        perType += `<div class="fi-row">
            <span class="fi-label" style="color:${t.color}">${t.label} ×${e.count} (${e.angle}°)</span>
            <span class="fi-val" style="color:${statusColor}">${openCount}/4 (${pct}%)</span>
        </div>`;
    }

    const barPct = Math.min(ratio / 2 * 100, 100);

    facadeInfoBody.innerHTML = `
        <div class="fi-ratio" style="color:${color}">${ratioPct}%</div>
        <div class="fi-ratio-sub">${I.dangerRelative}</div>
        <div class="fi-bar-wrap"><div class="fi-bar" style="width:${barPct}%;background:${color}"></div></div>
        <div class="fi-row"><span class="fi-label">${I.dangerSpot}</span><span class="fi-val" style="color:${color}">${(score * 100).toFixed(1)}%</span></div>
        <div class="fi-row"><span class="fi-label">${I.dangerCityAvg}</span><span class="fi-val">${(cityAvgDanger * 100).toFixed(1)}%</span></div>
        <hr class="fi-divider">
        ${perType}
        <button class="fi-map-btn" onclick="window.openDirectionMap()">${I.openMap || 'Map'}</button>
    `;
    facadeInfoEl.style.display = 'block';

    lastScores = computeDirectionScores(point, normal, mesh);
    const ddEl = document.getElementById('direction-diagram');
    if (lastScores.length > 0) {
        renderDirectionDiagram(lastScores, normal);
        ddEl.style.display = 'block';
    } else {
        ddEl.style.display = 'none';
    }
}

// ── Mouse Interaction ──────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDownPos = null;

renderer.domElement.addEventListener('mousedown', e => { mouseDownPos = { x: e.clientX, y: e.clientY }; });

renderer.domElement.addEventListener('mouseup', event => {
    if (!mouseDownPos) return;
    const dx = event.clientX - mouseDownPos.x;
    const dy = event.clientY - mouseDownPos.y;
    mouseDownPos = null;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length === 0) return;
    const hit = intersects[0];
    if (hit.object === ground || hit.object.userData.isImpact) return;

    const point = hit.point;
    const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);

    updateFacadeInfo(point, normal, hit.object);
    if (event.button === 0) {
        const newTarget = point.clone();
        const startTarget = controls.target.clone();
        const startPos = camera.position.clone();
        const offset = camera.position.clone().sub(controls.target);
        const endPos = newTarget.clone().add(offset);
        const duration = 400;
        const startTime = performance.now();

        function animateFocus(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            controls.target.lerpVectors(startTarget, newTarget, ease);
            camera.position.lerpVectors(startPos, endPos, ease);
            if (t < 1) requestAnimationFrame(animateFocus);
        }
        requestAnimationFrame(animateFocus);
    }
});

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// ── Keyboard ───────────────────────────────────────────

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        removeHighlight();
        currentHighlight = null;
        lastScores = null;
        facadeInfoEl.style.display = 'none';
        document.getElementById('direction-diagram').style.display = 'none';
        document.getElementById('search-results').style.display = 'none';
        searchInput.blur();
        return;
    }

    if (document.activeElement === searchInput || document.activeElement?.tagName === 'INPUT') return;

    const key = e.key.toLowerCase();
    const panDist = sceneSize * 0.015;

    if ('wasdqwe'.includes(key)) {
        camera.getWorldDirection(_forward);
        _forward.y = 0;
        if (_forward.lengthSq() < 0.001) _forward.z = -1;
        _forward.normalize();
        _right.crossVectors(_forward, _up).normalize();

        switch (key) {
            case 'w': controls.target.addScaledVector(_forward, panDist); camera.position.addScaledVector(_forward, panDist); break;
            case 's': controls.target.addScaledVector(_forward, -panDist); camera.position.addScaledVector(_forward, -panDist); break;
            case 'a': controls.target.addScaledVector(_right, -panDist); camera.position.addScaledVector(_right, -panDist); break;
            case 'd': controls.target.addScaledVector(_right, panDist); camera.position.addScaledVector(_right, panDist); break;
            case 'q': controls.target.y -= panDist; camera.position.y -= panDist; break;
            case 'e': controls.target.y += panDist; camera.position.y += panDist; break;
        }
        controls.update();
        e.preventDefault();
    }
});

// ── Resize ─────────────────────────────────────────────

window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

// ── Zoom Controls ──────────────────────────────────────

document.getElementById('zoom-in').addEventListener('mousedown', e => e.stopPropagation());
document.getElementById('zoom-out').addEventListener('mousedown', e => e.stopPropagation());

document.getElementById('zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    const cam = controls.object;
    const dir = new THREE.Vector3().subVectors(controls.target, cam.position);
    const dist = dir.length();
    const step = Math.min(dist * 0.3, 200);
    if (dist < 2) return;
    cam.position.addScaledVector(dir.normalize(), step);
    controls.update();
});

document.getElementById('zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    const cam = controls.object;
    const dir = new THREE.Vector3().subVectors(cam.position, controls.target);
    const dist = dir.length();
    const step = Math.max(dist * 0.3, 50);
    cam.position.addScaledVector(dir.normalize(), step);
    controls.update();
});

// ── Render Loop ────────────────────────────────────────

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

// ── GPS / Map ───────────────────────────────────────────

const KYIV_CENTER_LAT = 50.4501;
const KYIV_CENTER_LNG = 30.5234;

function toGPS(point) {
    const dx = point.x - sceneCenter.x;
    const dz = point.z - sceneCenter.z;
    const metersEast = dx / unitsPerMeter;
    const metersNorth = -dz / unitsPerMeter;
    const lat = KYIV_CENTER_LAT + metersNorth / 111320;
    const lng = KYIV_CENTER_LNG + metersEast / (111320 * Math.cos(KYIV_CENTER_LAT * Math.PI / 180));
    return { lat: lat, lng: lng };
}

let lastScores = null;

function compassSvg(w, h, r, dirs, drawFn) {
    const cx = w / 2, cy = h / 2;
    let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(13,17,23,0.6)" stroke="#30363d" stroke-width="0.8"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(1)}" fill="none" stroke="#21262d" stroke-width="0.3"/>`;
    for (const d of dirs) {
        const a = (d.angle - 90) * Math.PI / 180;
        s += `<text x="${(cx + (r + 7) * Math.cos(a)).toFixed(1)}" y="${(cy + (r + 7) * Math.sin(a)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#8b949e" font-size="7" font-weight="600">${d.label}</text>`;
    }
    s += drawFn(cx, cy, r);
    s += '</svg>';
    return s;
}

function openDirectionMap() {
    if (!currentHighlight || !lastScores || lastScores.length === 0) return;

    const { point, normal } = currentHighlight;
    const gps = toGPS(point);
    const lat = Number(gps.lat), lng = Number(gps.lng);

    const best = lastScores.reduce((a, b) => a.combined > b.combined ? a : b);
    const bestAz = best.azimuth;
    const I = window.I18N;

    const dirs = [
        { label: I.compassN || 'N', angle: 0 },
        { label: I.compassE || 'E', angle: 90 },
        { label: I.compassS || 'S', angle: 180 },
        { label: I.compassW || 'W', angle: 270 }
    ];

    const typeKeys = ['drone', 'missile', 'ballistic'];
    const colors = { drone: '#f0883e', missile: '#58a6ff', ballistic: '#f85149' };

    // max per-type & combined
    const maxExp = {};
    for (const key of typeKeys) {
        maxExp[key] = 0.001;
        for (const d of lastScores) {
            if (d.types && d.types[key] > maxExp[key]) maxExp[key] = d.types[key];
        }
    }
    let maxComb = 0.001;
    for (const d of lastScores) { if (d.combined > maxComb) maxComb = d.combined; }

    const halfA = 2.3 * Math.PI / 180;

    // petal generators
    function perTypePetals(cx, cy, r, key) {
        let s = '';
        const maxE = maxExp[key];
        for (const d of lastScores) {
            const exp = d.types ? d.types[key] : 0;
            if (exp <= 0) continue;
            const val = exp / maxE;
            if (val < 0.005) continue;
            const angle = (d.azimuth - 90) * Math.PI / 180;
            const len = val * r;
            s += `<polygon points="${cx},${cy} ${(cx + len * Math.cos(angle - halfA)).toFixed(1)},${(cy + len * Math.sin(angle - halfA)).toFixed(1)} ${(cx + len * Math.cos(angle + halfA)).toFixed(1)},${(cy + len * Math.sin(angle + halfA)).toFixed(1)}" fill="${colors[key]}" opacity="0.85"/>`;
        }
        return s;
    }

    function combinedPetals(cx, cy, r) {
        let s = '';
        for (const d of lastScores) {
            const cval = d.combined / maxComb;
            if (cval < 0.005) continue;
            let r0 = 0;
            for (const key of typeKeys) {
                const w = d.weights ? d.weights[key] : 0;
                if (!w || w <= 0) continue;
                const r1 = r0 + (w / maxComb) * r;
                const angle = (d.azimuth - 90) * Math.PI / 180;
                s += `<polygon points="${(cx + r0 * Math.cos(angle - halfA)).toFixed(1)},${(cy + r0 * Math.sin(angle - halfA)).toFixed(1)} ${(cx + r1 * Math.cos(angle - halfA)).toFixed(1)},${(cy + r1 * Math.sin(angle - halfA)).toFixed(1)} ${(cx + r1 * Math.cos(angle + halfA)).toFixed(1)},${(cy + r1 * Math.sin(angle + halfA)).toFixed(1)} ${(cx + r0 * Math.cos(angle + halfA)).toFixed(1)},${(cy + r0 * Math.sin(angle + halfA)).toFixed(1)}" fill="${colors[key]}" opacity="0.85"/>`;
                r0 = r1;
            }
        }
        return s;
    }

    // generate 4 SVGs
    const combSvg = compassSvg(180, 180, 72, dirs, (cx, cy, r) => combinedPetals(cx, cy, r));
    const droneSvg = compassSvg(66, 66, 26, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'drone'));
    const missileSvg = compassSvg(66, 66, 26, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'missile'));
    const ballisticSvg = compassSvg(66, 66, 26, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'ballistic'));

    // ── Show map panel ──

    const panel = document.getElementById('map-panel');
    panel.style.display = 'flex';

    // destroy previous map if any
    if (window._dangerMap) {
        window._dangerMap.remove();
        window._dangerMap = null;
    }

    const map = L.map('map-inner', { center: [lat, lng], zoom: 17, zoomControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);

    // direction line
    const lineLenDeg = 0.008;
    const bestAzRad = bestAz * Math.PI / 180;
    const cosLat = Math.cos(lat * Math.PI / 180);
    const endLat = lat + lineLenDeg * Math.cos(bestAzRad);
    const endLng = lng + lineLenDeg * Math.sin(bestAzRad) / cosLat;

    const arrLen = 0.0004;
    const arrAngle = Math.atan2(lng - endLng, lat - endLat);
    const arrPts = [
        [lat, lng],
        [lat - arrLen * Math.cos(arrAngle - 0.5), lng - arrLen * Math.sin(arrAngle - 0.5) / cosLat],
        [lat - arrLen * Math.cos(arrAngle + 0.5), lng - arrLen * Math.sin(arrAngle + 0.5) / cosLat]
    ];

    L.polyline([[endLat, endLng], [lat, lng]], { color: '#f85149', weight: 2, dashArray: '6,4', opacity: 0.7 }).addTo(map);
    L.polygon(arrPts, { color: '#f85149', fillColor: '#f85149', fillOpacity: 0.7, weight: 1 }).addTo(map);

    // 4 separate markers
    function addMarker(latOff, lngOff, svg, sz) {
        const icon = L.divIcon({
            className: 'dir-marker',
            html: svg,
            iconSize: [sz, sz],
            iconAnchor: [sz / 2, sz / 2]
        });
        L.marker([lat + latOff, lng + lngOff], { icon, interactive: true }).addTo(map);
    }

    const off = 0.0003;
    addMarker(0, 0, combSvg, 180);
    addMarker(off, -off, droneSvg, 66);
    addMarker(off, off, missileSvg, 66);
    addMarker(-off * 1.5, 0, ballisticSvg, 66);

    window._dangerMap = map;

    // fix Leaflet size after flex layout renders
    setTimeout(() => map.invalidateSize(), 50);

    // update info bar
    document.getElementById('map-info').innerHTML =
        `<span>${I.openMapCoord || 'Coordinates'}: ${lat.toFixed(6)}, ${lng.toFixed(6)}</span>`
        + `<span class="map-sep">&middot;</span>`
        + `<span>${I.openMapThreat || 'Threat direction'}: <strong style="color:#f85149">${bestAz}°</strong></span>`;

    // resize 3D view
    window.dispatchEvent(new Event('resize'));
}

window.openDirectionMap = openDirectionMap;

// ── Address Search ─────────────────────────────────────

let searchTimer = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 3) { searchResults.style.display = 'none'; return; }
    searchTimer = setTimeout(() => geocodeSearch(q), 350);
});

searchInput.addEventListener('blur', () => {
    setTimeout(() => { searchResults.style.display = 'none'; }, 200);
});

searchInput.addEventListener('focus', () => {
    if (searchResults.children.length > 0) searchResults.style.display = 'block';
});

async function geocodeSearch(query) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&q='
        + encodeURIComponent(query)
        + '&limit=5&bounded=1&viewbox=30.41,50.33,30.67,50.57';

    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'DangerMap/1.0' } });
        if (!res.ok) return;
        const data = await res.json();
        showResults(data);
    } catch (err) {
        console.warn('Search error:', err);
    }
}

function showResults(data) {
    searchResults.innerHTML = '';
    if (!data || data.length === 0) { searchResults.style.display = 'none'; return; }

    for (const r of data) {
        const div = document.createElement('div');
        div.className = 'result-item';
        const label = r.display_name.split(',').slice(0, 3).join(',');
        div.innerHTML = `<span>${label}</span><span class="result-type">${r.type || ''}</span>`;
        div.addEventListener('mousedown', e => e.preventDefault());
        div.addEventListener('click', () => {
            flyToAddress(parseFloat(r.lat), parseFloat(r.lon));
            searchResults.style.display = 'none';
            searchInput.value = label;
            searchInput.blur();
        });
        searchResults.appendChild(div);
    }
    searchResults.style.display = 'block';
}

async function flyToAddress(lat, lng) {
    await ensureBuildingsAt(lat, lng);
    const meters = latLngToMeters(lat, lng);
    const target = new THREE.Vector3(meters.x, 0, meters.z);

    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const offset = camera.position.clone().sub(controls.target);
    const endPos = target.clone().add(offset);
    const duration = 600;
    const startTime = performance.now();

    function tick(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - t) * (1 - t) * (1 - t);
        controls.target.lerpVectors(startTarget, target, ease);
        camera.position.lerpVectors(startPos, endPos, ease);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

export { ATTACK_TYPES, DEG, unitsPerMeter, getFacadeBasis, computeAdaptiveHalf, isBlocked };
