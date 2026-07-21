import * as THREE from 'three';
import { buildingMeshes, unitsPerMeter, _up, DEG, sceneCenter, sceneBounds3 } from './scene.js';
import { getCount, getAzDeg, getAzRad } from './params.js';

export const ATTACK_TYPES = [
    { key: 'drone',     color: '#f0883e', angle: 10, weight: 1.0 },
    { key: 'missile',   color: '#58a6ff', angle: 40, weight: 1.5 },
    { key: 'ballistic', color: '#f85149', angle: 60, weight: 2.0 }
];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _box = new THREE.Box3();
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _attackDir = new THREE.Vector3();
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _colorGreen = new THREE.Color(0x3fb950);
const _colorRed = new THREE.Color(0xf85149);
const _raycaster = new THREE.Raycaster();

export let cityAvgDanger = 0;
const cityAvgSamples = [];

// Raycast occlusion check: true if a building blocks line-of-sight from origin in dir direction
export function isBlocked(origin, dir, facadePoint, facadeNormal) {
    _raycaster.set(origin, dir);
    _raycaster.near = 0;
    _raycaster.far = 500 * unitsPerMeter;
    const hits = _raycaster.intersectObjects(buildingMeshes, false);
    const selfThreshold = 3 * unitsPerMeter;
    return hits.some(h => {
        _v.subVectors(h.point, facadePoint);
        return Math.abs(_v.dot(facadeNormal)) >= selfThreshold;
    });
}

export function getFacadeBasis(normal) {
    if (Math.abs(normal.dot(_up)) > 0.99) {
        _tangent.set(1, 0, 0);
    } else {
        _tangent.crossVectors(_up, normal).normalize();
    }
    _bitangent.crossVectors(normal, _tangent).normalize();
    return { tangent: _tangent, bitangent: _bitangent };
}

// Compute adaptive facade sample radius based on building bounding box size
export function computeAdaptiveHalf(point, tangent, bitangent, mesh) {
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

// For each attack type, compute exposure: how many of 4 facade corners are unblocked and facing the threat
export function computeExposure(point, normal, mesh) {
    const { tangent, bitangent } = getFacadeBasis(normal);
    const half = computeAdaptiveHalf(point, tangent, bitangent, mesh);
    _corners[0].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, half);
    _corners[1].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, -half);
    _corners[2].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, half);
    _corners[3].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, -half);
    const result = {};

    for (const t of ATTACK_TYPES) {
        const count = getCount(t.key);
        if (count === 0) {
            result[t.key] = { open: false, exposure: 0, weight: t.weight, count: 0, angle: t.angle };
            continue;
        }
        const azRad = getAzRad(t.key);
        const alpha = t.angle * DEG;
        _attackDir.set(
            -Math.cos(alpha) * Math.sin(azRad),
            Math.sin(alpha),
            Math.cos(alpha) * Math.cos(azRad)
        );
        const facingDot = normal.dot(_attackDir);
        if (facingDot <= 0) {
            result[t.key] = { open: false, exposure: 0, weight: t.weight, count, angle: t.angle, azDeg: getAzDeg(t.key), blockedCount: 4 };
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
            azDeg: getAzDeg(t.key),
            blockedCount
        };
    }
    return result;
}

// Weighted average of all attack type exposures into a single 0..1 danger score
export function dangerScore(exposure) {
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

export function smoothDangerColor(ratio) {
    const t = Math.max(0, Math.min(ratio, 2)) / 2;
    const r = Math.round(63 + 185 * t);
    const g = Math.round(185 - 130 * t);
    const b = Math.round(80 - 31 * t);
    return `rgb(${r},${g},${b})`;
}

// Sample ~10 buildings across the scene, 4 facades each, for city-average danger baseline
export function buildCitySamples() {
    cityAvgSamples.length = 0;
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

export function computeCityAverage() {
    let sum = 0;
    for (const patch of cityAvgSamples) {
        const exp = computeExposure(patch.center, patch.normal, null);
        sum += dangerScore(exp);
    }
    cityAvgDanger = cityAvgSamples.length > 0 ? sum / cityAvgSamples.length : 0.001;
}
