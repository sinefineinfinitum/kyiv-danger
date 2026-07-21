import * as THREE from 'three';
import { renderer, camera, scene, controls, ground, container, buildingMeshes, sceneCenter, sceneSize, unitsPerMeter, DEG, loadBar, _up } from './scene.js';
import { initBuildings, ensureBuildingsAt, toGPS, latLngToMeters, getLoadedBounds } from './buildings.js';
import { ATTACK_TYPES, computeExposure, dangerScore, smoothDangerColor, getFacadeBasis, computeAdaptiveHalf, isBlocked, buildCitySamples, computeCityAverage, cityAvgDanger } from './danger.js';
import { computeDirectionScores, renderDirectionDiagram } from './direction-diagram.js';
import { getCount, getAzDeg, getAzRad, setParams } from './params.js';

const I = window.I18N;
const facadeInfoEl = document.getElementById('facade-info');
const facadeInfoBody = document.getElementById('facade-info-body');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// ── Highlight state ──
let highlightMesh = null;
let highlightExtras = [];
let currentHighlight = null;
let lastScores = null;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

// ── Danger Colors ──

// ── Highlight & Facade Info ──

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
            o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        } else {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        }
    }
    highlightExtras = [];
}

// Render a semitransparent overlay + grid on the selected facade
function createFacadeHighlight(point, normal) {
    removeHighlight();
    const size = 10 * unitsPerMeter;
    const gridStep = 2 * unitsPerMeter;

    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthTest: true, depthWrite: false });
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

// Draw colored lines from facade corners in the attack direction (green=blocked, red=open)
function createDirectionRays(point, normal, exposure, mesh) {
    const { tangent, bitangent } = getFacadeBasis(normal);
    const half = computeAdaptiveHalf(point, tangent, bitangent, mesh);
    const _corners = [new THREE.Vector3().copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, half),
                     new THREE.Vector3().copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, -half),
                     new THREE.Vector3().copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, half),
                     new THREE.Vector3().copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, -half)];
    const rayLen = 500 * unitsPerMeter;
    const _attackDir = new THREE.Vector3();
    const _v2 = new THREE.Vector3();
    const _v4 = new THREE.Vector3();
    const _colorGreen = new THREE.Color(0x3fb950);
    const _colorRed = new THREE.Color(0xf85149);

    for (const t of ATTACK_TYPES) {
        const e = exposure[t.key];
        if (e.count === 0) continue;
        const azRad = getAzRad(t.key);
        const srcAz = azRad + Math.PI;
        const alpha = t.angle * DEG;
        _attackDir.set(-Math.cos(alpha) * Math.sin(srcAz), Math.sin(alpha), Math.cos(alpha) * Math.cos(srcAz));
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

// Compute exposure for the selected facade and update the info panel + direction diagram
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
            <span class="fi-label" style="color:${t.color}">${I[t.key]} ×${e.count} (${e.angle}°)</span>
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
    `;
    facadeInfoEl.style.display = 'block';

    lastScores = computeDirectionScores(point, normal, mesh);
    updateMap();
    const ddEl = document.getElementById('direction-diagram');
    if (lastScores.length > 0) {
        renderDirectionDiagram(lastScores, normal);
        ddEl.style.display = 'block';
    } else {
        ddEl.style.display = 'none';
    }
}

// ── Mouse Interaction ──

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDownPos = null;
let _touchActive = false;

renderer.domElement.addEventListener('mousedown', e => {
    if (_touchActive) { _touchActive = false; return; }
    mouseDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
        mouseDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
}, { passive: true });

renderer.domElement.addEventListener('touchend', async e => {
    _touchActive = true;
    if (!mouseDownPos) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - mouseDownPos.x;
    const dy = touch.clientY - mouseDownPos.y;
    mouseDownPos = null;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length === 0) return;
    const hit = intersects[0];
    if (hit.object === ground || hit.object.userData.isImpact) return;

    const point = hit.point;
    const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);

    const gps = toGPS(point);
    await ensureBuildingsAt(gps.lat, gps.lng);
    updateFacadeInfo(point, normal, hit.object);
});

renderer.domElement.addEventListener('mouseup', async event => {
    if (_touchActive) { _touchActive = false; return; }
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

    if (event.button === 2) {
        const gps = toGPS(point);
        await ensureBuildingsAt(gps.lat, gps.lng);
        updateFacadeInfo(point, normal, hit.object);
    } else if (event.button === 0) {
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

// ── Keyboard ──

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

// ── Zoom Controls ──

['zoom-in', 'zoom-out'].forEach(id => {
    document.getElementById(id).addEventListener('mousedown', e => e.stopPropagation());
});
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

// ── UI Sync ──

let _rebuildRaf = null;
function scheduleRebuild() {
    if (_rebuildRaf) cancelAnimationFrame(_rebuildRaf);
    _rebuildRaf = requestAnimationFrame(() => {
        _rebuildRaf = null;
        rebuildAttacks();
    });
}

function rebuildAttacks() {
    let total = 0;
    for (const t of ATTACK_TYPES) {
        const count = getCount(t.key);
        document.getElementById(`${t.key}-badge`).textContent = count;
        total += count;
    }
    document.getElementById('summary').innerHTML = `${I.totalObjects}: <strong>${total}</strong>`;
    computeCityAverage();
    if (currentHighlight) updateFacadeInfo(currentHighlight.point, currentHighlight.normal, currentHighlight.mesh);
}
window.rebuildAttacks = rebuildAttacks;

['drone', 'missile', 'ballistic'].forEach(type => {
    document.getElementById(`${type}-count`).addEventListener('input', () => {
        const el = document.getElementById(`${type}-count`);
        const val = parseInt(el.value, 10);
        setParams(type, val, getAzDeg(type));
        el.value = getCount(type);
        scheduleRebuild();
    });
    document.getElementById(`${type}-az`).addEventListener('input', () => {
        const el = document.getElementById(`${type}-az`);
        const val = parseFloat(el.value);
        setParams(type, getCount(type), val);
        el.value = getAzDeg(type);
        scheduleRebuild();
    });
});

// ── Map Diagrams ──

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

// ── Map ──

let _dangerMap = null;
let _diagramMarker = null;
let _diagramLine = null;
let _diagramArrow = null;
let _diagrams = null;
let _diagramLat = null;
let _diagramLng = null;

function initMap() {
    if (_dangerMap) return;
    _dangerMap = L.map('map-inner', { center: [50.45, 30.52], zoom: 13, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(_dangerMap);
    setTimeout(() => _dangerMap.invalidateSize(), 100);
}

function updateDiagramView(view) {
    if (!_dangerMap) return;
    document.querySelectorAll('.ms-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'combined' || !_diagrams || !_diagrams[view]) {
        if (_diagramMarker) { _dangerMap.removeLayer(_diagramMarker); _diagramMarker = null; }
        return;
    }
    const d = _diagrams[view];
    const icon = L.divIcon({ className: 'dir-marker', html: d.svg, iconSize: [d.sz, d.sz], iconAnchor: [d.sz / 2, d.sz / 2] });
    if (_diagramMarker) { _diagramMarker.setIcon(icon); }
    else { _diagramMarker = L.marker([_diagramLat, _diagramLng], { icon, interactive: true }).addTo(_dangerMap); }
}

document.getElementById('map-switcher').addEventListener('click', e => {
    const view = e.target.dataset.view;
    if (view) updateDiagramView(view);
});

function updateMap() {
    if (!_dangerMap) initMap();
    if (_diagramMarker) { _dangerMap.removeLayer(_diagramMarker); _diagramMarker = null; }
    if (_diagramLine) { _dangerMap.removeLayer(_diagramLine); _diagramLine = null; }
    if (_diagramArrow) { _dangerMap.removeLayer(_diagramArrow); _diagramArrow = null; }
    _diagrams = null;
    const infoEl = document.getElementById('map-info');

    if (!currentHighlight || !lastScores || lastScores.length === 0) {
        infoEl.innerHTML = '';
        return;
    }

    const { point } = currentHighlight;
    const gps = toGPS(point);
    const lat = Number(gps.lat), lng = Number(gps.lng);

    const best = lastScores.reduce((a, b) => a.combined > b.combined ? a : b);
    const bestAz = best.azimuth;

    _dangerMap.setView([lat, lng], 17);

    const dirs = [
        { label: I.compassN || 'N', angle: 0 },
        { label: I.compassE || 'E', angle: 90 },
        { label: I.compassS || 'S', angle: 180 },
        { label: I.compassW || 'W', angle: 270 }
    ];

    const typeKeys = ['drone', 'missile', 'ballistic'];
    const colors = { drone: '#f0883e', missile: '#58a6ff', ballistic: '#f85149' };

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

    const perTypePetals = (cx, cy, r, key) => {
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
    };

    const combinedPetals = (cx, cy, r) => {
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
    };

    const combSvg = compassSvg(180, 180, 72, dirs, (cx, cy, r) => combinedPetals(cx, cy, r));
    const droneSvg = compassSvg(180, 180, 72, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'drone'));
    const missileSvg = compassSvg(180, 180, 72, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'missile'));
    const ballisticSvg = compassSvg(180, 180, 72, dirs, (cx, cy, r) => perTypePetals(cx, cy, r, 'ballistic'));

    _diagrams = { combined: { svg: combSvg, sz: 180 }, drone: { svg: droneSvg, sz: 180 }, missile: { svg: missileSvg, sz: 180 }, ballistic: { svg: ballisticSvg, sz: 180 } };
    _diagramLat = lat;
    _diagramLng = lng;

    // Direction line
    const lineLenDeg = 0.008;
    const bestAzRad = bestAz * Math.PI / 180;
    const cosLat = Math.cos(lat * Math.PI / 180);
    const endLat = lat + lineLenDeg * Math.cos(bestAzRad);
    const endLng = lng + lineLenDeg * Math.sin(bestAzRad) / cosLat;

    const arrLen = 0.0004;
    const arrAngle = Math.atan2(endLng - lng, endLat - lat);
    const arrPts = [
        [endLat, endLng],
        [endLat - arrLen * Math.cos(arrAngle - 0.5), endLng - arrLen * Math.sin(arrAngle - 0.5) / cosLat],
        [endLat - arrLen * Math.cos(arrAngle + 0.5), endLng - arrLen * Math.sin(arrAngle + 0.5) / cosLat]
    ];

    _diagramLine = L.polyline([[lat, lng], [endLat, endLng]], { color: '#f85149', weight: 2, dashArray: '6,4', opacity: 0.7 }).addTo(_dangerMap);
    _diagramArrow = L.polygon(arrPts, { color: '#f85149', fillColor: '#f85149', fillOpacity: 0.7, weight: 1 }).addTo(_dangerMap);

    updateDiagramView('drone');

    infoEl.innerHTML =
        `<span>${I.openMapCoord || 'Coordinates'}: ${lat.toFixed(6)}, ${lng.toFixed(6)}</span>`
        + `<span class="map-sep">&middot;</span>`
        + `<span>${I.openMapThreat || 'Threat direction'}: <strong style="color:#f85149">${bestAz}°</strong></span>`;

    setTimeout(() => _dangerMap.invalidateSize(), 50);
}

window.updateMap = updateMap;
initMap();

// ── Address Search ──

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
        const res = await fetch(url, { headers: { 'User-Agent': 'DangerMap/1.0 (https://github.com/sinefineinfinitum/kyiv-danger)' } });
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

// Load buildings near the target coordinates if needed, then animate camera to the location
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

// ── Init ──

if (location.protocol === 'file:') {
    console.warn('⚠ Opened via file:// — fetch() to Overpass API will be blocked by CORS.');
    console.warn('💡 Run a local server: npx serve or npx http-server in the danger folder');
}
initBuildings().then(() => {
    buildCitySamples();
    rebuildAttacks();
});
