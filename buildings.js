import * as THREE from 'three';
import { scene, buildingMeshes, sceneCenter, setSceneCenter, sceneSize, setSceneSize, sceneBounds3, expandSceneBounds3, unitsPerMeter, setUnitsPerMeter, ground, camera, controls, loadBar, loadingDiv, updateSunPosition, setupCamera, setSceneBounds3 } from './scene.js';
import { buildCitySamples, computeCityAverage } from './danger.js';

const OSM_API = 'https://overpass.kumi.systems/api/interpreter';
const OSM_FALLBACK_API = 'https://overpass-api.de/api/interpreter';
const LOCAL_BUILDINGS_URL = 'data/buildings.json';

const OVERPASS_API_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.rack66.com/api/interpreter',
];

const KYIV_CENTER_LAT = 50.4501;
const KYIV_CENTER_LNG = 30.5234;

const BUILDING_COLORS = {
    residential: 0x5a6a7a, apartment: 0x5a7a8a, house: 0x6a7a5a,
    commercial: 0x5a7a8a, retail: 0x6a7a7a, industrial: 0x6a6a5a,
    warehouse: 0x7a7a6a, office: 0x5a6a8a, hotel: 0x6a7a9a,
    school: 0x7a6a7a, university: 0x6a6a8a, hospital: 0x8a6a6a,
    church: 0x7a6a5a, default: 0x6a7a7a
};

let loadedBounds = null;

export function getLoadedBounds() { return loadedBounds; }

export function latLngToMeters(lat, lng) {
    const dLat = lat - KYIV_CENTER_LAT;
    const dLng = lng - KYIV_CENTER_LNG;
    const cosLat = Math.cos(KYIV_CENTER_LAT * Math.PI / 180);
    const metersNorth = dLat * 111320;
    const metersEast = dLng * (111320 * cosLat);
    return { x: metersEast, z: -metersNorth };
}

export function toGPS(point) {
    const metersEast = point.x / unitsPerMeter;
    const metersNorth = -point.z / unitsPerMeter;
    const lat = KYIV_CENTER_LAT + metersNorth / 111320;
    const lng = KYIV_CENTER_LNG + metersEast / (111320 * Math.cos(KYIV_CENTER_LAT * Math.PI / 180));
    return { lat, lng };
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

// Convert OSM way to a Three.js extruded building mesh at GPS coordinates
function osmWayToMesh(way) {
    if (!way.geometry || way.geometry.length < 3) return null;
    const coords = way.geometry.map(p => latLngToMeters(p.lat, p.lon));
    const shape = new THREE.Shape();
    shape.moveTo(coords[0].x, -coords[0].z);
    for (let i = 1; i < coords.length; i++) shape.lineTo(coords[i].x, -coords[i].z);
    const height = osmHeight(way.tags || {});
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const type = osmBuildingType(way.tags || {});
    const mat = new THREE.MeshStandardMaterial({
        color: BUILDING_COLORS[type], roughness: 0.85, metalness: 0.1, shadowSide: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function computeBoundsFromOSMData(data) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let found = false;
    for (const el of data.elements) {
        if (el.type !== 'way' || !el.geometry) continue;
        for (const p of el.geometry) {
            const m = latLngToMeters(p.lat, p.lon);
            if (m.x < minX) minX = m.x;
            if (m.x > maxX) maxX = m.x;
            if (m.z < minZ) minZ = m.z;
            if (m.z > maxZ) maxZ = m.z;
            found = true;
        }
    }
    return found ? { minX, maxX, minZ, maxZ } : null;
}

export async function createMeshesFromOSMData(data, group, batchSize = 50) {
    let count = 0;
    const elements = data.elements.filter(el => el.type === 'way' && el.geometry);
    const total = elements.length;
    if (total === 0) { console.warn('⚠ No building elements found in data'); return { count }; }
    console.log(`🏗 Creating ${total} buildings...`);
    for (let i = 0; i < total; i++) {
        const mesh = osmWayToMesh(elements[i]);
        if (mesh) { group.add(mesh); buildingMeshes.push(mesh); count++; }
        if ((i + 1) % batchSize === 0) {
            loadBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
            console.log(`📦 Batch ${i + 1}/${total} (${Math.round((i + 1) / total * 100)}%) — ${count} buildings created`);
            await new Promise(r => setTimeout(r, 0));
        }
    }
    console.log(`✅ Done: ${count} / ${total} buildings loaded`);
    return { count };
}

async function tryOverpass(url, query, method) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const opts = { signal: controller.signal };
        if (method === 'POST') {
            opts.method = 'POST';
            opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            opts.body = 'data=' + encodeURIComponent(query);
        } else {
            opts.method = 'GET';
        }
        const res = await fetch(method === 'GET' ? url + '?data=' + encodeURIComponent(query) : url, opts);
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        console.log(`🌍 Overpass OK: ${url} (${method}) — ${data.elements?.length || 0} elements`);
        return data;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function tryLoadOSMBuildings(bbox) {
    const query = `[out:json][timeout:25][bbox:${bbox || '50.447,30.518,50.453,30.530'}];
(way["building"];);
out geom;`;
    let lastErr;
    for (const url of OVERPASS_API_URLS) {
        for (const method of ['POST', 'GET']) {
            try {
                return await tryOverpass(url, query, method);
            } catch (err) {
                lastErr = err;
                console.warn(`⚠ Overpass failed: ${url} (${method}) — ${err.message}`);
            }
        }
    }
    try {
        console.warn('⚠ Trying OSM API directly...');
        const [minLat, minLng, maxLat, maxLng] = bbox.split(',').map(Number);
        const osmUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${minLng},${minLat},${maxLng},${maxLat}`;
        const res = await fetch(osmUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const xml = await res.text();
        const data = osmXmlToJson(xml);
        console.log(`🌍 OSM API OK: ${data.elements?.length || 0} elements`);
        return data;
    } catch (err) {
        console.warn(`⚠ OSM API failed: ${err.message}`);
        throw err;
    }
}

// Parse OSM XML response from the /api/0.6/map endpoint into elements array matching Overpass format
function osmXmlToJson(xml) {
    const elements = [];
    const nodes = {};
    const wayEls = [...xml.matchAll(/<way[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)];
    for (const nodeEl of xml.matchAll(/<node[^>]*\/?>/g)) {
        const id = nodeEl[0].match(/id="(\d+)"/);
        const lat = nodeEl[0].match(/lat="([\d.-]+)"/);
        const lon = nodeEl[0].match(/lon="([\d.-]+)"/);
        if (id && lat && lon) nodes[id[1]] = { lat: parseFloat(lat[1]), lon: parseFloat(lon[1]) };
    }
    for (const [, wid, inner] of wayEls) {
        const nds = [...inner.matchAll(/<nd[^>]*ref="(\d+)"[^>]*\/?>/g)].map(m => nodes[m[1]]).filter(Boolean);
        if (nds.length < 3) continue;
        const tags = {};
        for (const t of inner.matchAll(/<tag[^>]*k="([^"]*)"[^>]*v="([^"]*)"[^>]*\/?>/g)) tags[t[1]] = t[2];
        if (!tags.building) continue;
        elements.push({ type: 'way', id: parseInt(wid), geometry: nds, tags });
    }
    return { elements };
}

async function tryLoadLocalBuildings() {
    const res = await fetch(LOCAL_BUILDINGS_URL);
    if (!res.ok) throw new Error('Local file not found');
    return await res.json();
}

export async function initBuildings() {
    try {
        console.log('🚀 Initializing scene...');
        let data;
        try {
            console.log('📁 Loading local buildings file...');
            data = await tryLoadLocalBuildings();
            console.log(`✅ Loaded local data: ${data.elements?.length || 0} elements`);
        } catch {
            console.warn('Local file failed, trying Overpass API...');
            data = await tryLoadOSMBuildings();
            console.log(`✅ Loaded from Overpass: ${data.elements?.length || 0} elements`);
        }

        const rawBounds = computeBoundsFromOSMData(data);
        if (!rawBounds) throw new Error('No buildings found');
        console.log(`🗺 Scene bounds: ${rawBounds.minX.toFixed(1)}..${rawBounds.maxX.toFixed(1)} x ${rawBounds.minZ.toFixed(1)}..${rawBounds.maxZ.toFixed(1)}`);

        setSceneCenter(new THREE.Vector3((rawBounds.minX + rawBounds.maxX) / 2, 0, (rawBounds.minZ + rawBounds.maxZ) / 2));
        setSceneSize(Math.sqrt((rawBounds.maxX - rawBounds.minX) ** 2 + (rawBounds.maxZ - rawBounds.minZ) ** 2));
        setSceneBounds3(new THREE.Box3(
            new THREE.Vector3(rawBounds.minX, 0, rawBounds.minZ),
            new THREE.Vector3(rawBounds.maxX, 0, rawBounds.maxZ)
        ));
        setUnitsPerMeter(1);
        ground.position.y = -0.5;

        const saved = localStorage.getItem('camera');
        let useSaved = false;
        if (saved) {
            try {
                const c = JSON.parse(saved);
                const dist = Math.sqrt((c.tx - sceneCenter.x) ** 2 + (c.tz - sceneCenter.z) ** 2);
                if (dist < sceneSize * 3) {
                    setupCamera(new THREE.Vector3(c.px, c.py, c.pz), new THREE.Vector3(c.tx, c.ty, c.tz));
                    useSaved = true;
                    console.log(`📷 Restored camera from localStorage (dist=${dist.toFixed(0)} from center)`);
                } else {
                    console.log(`📷 Ignoring saved camera — too far (dist=${dist.toFixed(0)} > ${(sceneSize * 3).toFixed(0)}), clearing localStorage`);
                    localStorage.removeItem('camera');
                }
            } catch(e) {}
        }
        if (!useSaved) {
            setupCamera(
                new THREE.Vector3(sceneCenter.x + sceneSize * 0.4, sceneCenter.y + sceneSize * 0.3, sceneCenter.z + sceneSize * 0.4),
                sceneCenter
            );
        }
        updateSunPosition();

        buildingMeshes.length = 0;
        const group = new THREE.Group();
        scene.add(group);
        const { count } = await createMeshesFromOSMData(data, group);
        if (count === 0) throw new Error('No buildings found');

        const [minLat, minLng, maxLat, maxLng] = [50.447, 30.518, 50.453, 30.530];
        loadedBounds = { minLat, minLng, maxLat, maxLng };
        loadingDiv.style.display = 'none';

        for (let di = 0; di < Math.min(5, buildingMeshes.length); di++) {
            const b = new THREE.Box3().setFromObject(buildingMeshes[di]);
            const c = b.getCenter(new THREE.Vector3());
            console.log(`🏠 Building ${di}: pos=(${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}), size=(${(b.max.x - b.min.x).toFixed(1)}, ${(b.max.y - b.min.y).toFixed(1)}, ${(b.max.z - b.min.z).toFixed(1)})`);
        }
        console.log(`📊 Total buildings in scene: ${buildingMeshes.length}, sceneObjects: ${scene.children.length}`);
        console.log('✅ Scene ready — click a building to analyze');
    } catch (err) {
        console.error('❌ OSM error:', err);
        loadingDiv.textContent = 'Error: ' + err.message;
    }
}

export async function ensureBuildingsAt(lat, lng) {
    if (loadedBounds && lat >= loadedBounds.minLat && lat <= loadedBounds.maxLat &&
        lng >= loadedBounds.minLng && lng <= loadedBounds.maxLng) {
        console.log(`📍 Already loaded area around ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        return;
    }
    const dLat = 0.003;
    const dLng = 0.004;
    const minLat = lat - dLat;
    const maxLat = lat + dLat;
    const minLng = lng - dLng;
    const maxLng = lng + dLng;
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    console.log(`🌍 Loading area bbox=${bbox} (center: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    loadingDiv.style.display = '';
    loadBar.style.width = '10%';

    try {
        const data = await tryLoadOSMBuildings(bbox);
        const group = new THREE.Group();
        scene.add(group);
        const { count } = await createMeshesFromOSMData(data, group);
        if (count === 0) return;

        const box = new THREE.Box3().setFromObject(group);
        expandSceneBounds3(box.min, box.max);
        setSceneCenter(box.getCenter(new THREE.Vector3()));
        setSceneSize(sceneBounds3.getSize(new THREE.Vector3()).length());

        if (loadedBounds) {
            loadedBounds = {
                minLat: Math.min(loadedBounds.minLat, minLat),
                maxLat: Math.max(loadedBounds.maxLat, maxLat),
                minLng: Math.min(loadedBounds.minLng, minLng),
                maxLng: Math.max(loadedBounds.maxLng, maxLng)
            };
        } else {
            loadedBounds = { minLat, maxLat, minLng, maxLng };
        }

        buildCitySamples();
        computeCityAverage();
        loadingDiv.style.display = 'none';
        console.log(`✅ Area loaded: ${count} buildings, total bounds expanded`);
    } catch (err) {
        loadingDiv.style.display = 'none';
        console.warn('❌ Failed to load buildings at', lat, lng, err.message);
    }
}
