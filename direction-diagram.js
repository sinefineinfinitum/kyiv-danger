import * as THREE from 'three';
import { DEG, unitsPerMeter } from './scene.js';
import { ATTACK_TYPES, getFacadeBasis, computeAdaptiveHalf, isBlocked } from './danger.js';
import { getCount } from './params.js';

// Temp vectors for hot function
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _attackDir = new THREE.Vector3();
const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

export function computeDirectionScores(point, normal, mesh) {
    const { tangent, bitangent } = getFacadeBasis(normal);
    const half = computeAdaptiveHalf(point, tangent, bitangent, mesh);
    _corners[0].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, half);
    _corners[1].copy(point).addScaledVector(tangent, half).addScaledVector(bitangent, -half);
    _corners[2].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, half);
    _corners[3].copy(point).addScaledVector(tangent, -half).addScaledVector(bitangent, -half);

    const typeCounts = {};
    for (const t of ATTACK_TYPES) {
        typeCounts[t.key] = getCount(t.key);
    }

    const scores = [];
    for (let az = 0; az < 360; az += 5) {
        const srcAz = (az + 180) % 360;
        const azRad = srcAz * DEG;
        const perType = {};
        let wSum = 0, wTotal = 0;

        for (const t of ATTACK_TYPES) {
            const count = typeCounts[t.key];
            const alpha = t.angle * DEG;
            _attackDir.set(
                -Math.cos(alpha) * Math.sin(azRad),
                Math.sin(alpha),
                Math.cos(alpha) * Math.cos(azRad)
            );

            const facingDot = normal.dot(_attackDir);
            if (facingDot <= 0) { perType[t.key] = 0; continue; }

            let blockedCount = 0;
            for (const corner of _corners) {
                _v.copy(corner).addScaledVector(normal, 0.1 * unitsPerMeter);
                if (isBlocked(_v, _attackDir, point, normal)) blockedCount++;
            }

            const openCount = 4 - blockedCount;
            const exposure = (openCount / 4) * facingDot;
            perType[t.key] = exposure;
            if (count > 0) {
                const w = count * t.weight;
                const angleFactor = Math.sin(alpha);
                wSum += exposure * w * angleFactor;
                wTotal += w * angleFactor;
            }
        }

        const combined = wTotal > 0 ? wSum / wTotal : 0;
        const weights = {};
        if (wTotal > 0) {
            for (const t of ATTACK_TYPES) {
                const count = typeCounts[t.key];
                if (count === 0) { weights[t.key] = 0; continue; }
                const alpha = t.angle * DEG;
                const w = count * t.weight;
                const angleFactor = Math.sin(alpha);
                weights[t.key] = perType[t.key] * w * angleFactor / wTotal;
            }
        } else {
            for (const t of ATTACK_TYPES) weights[t.key] = 0;
        }
        scores.push({ azimuth: az, types: perType, combined, weights });
    }
    return scores;
}

export function renderDirectionDiagram(scores, normal) {
    const container = document.getElementById('dd-container');
    container.innerHTML = '';
    if (scores.length === 0) return;

    const ns = 'http://www.w3.org/2000/svg';
    const subSize = 74;
    const subR = 30;

    function drawCompass(svg, drawFn, opts) {
        const cx = subSize / 2, cy = subSize / 2;
        const bg = document.createElementNS(ns, 'circle');
        bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', subR);
        bg.setAttribute('fill', 'rgba(13,17,23,0.5)'); bg.setAttribute('stroke', '#30363d'); bg.setAttribute('stroke-width', '0.8');
        svg.appendChild(bg);
        const hc = document.createElementNS(ns, 'circle');
        hc.setAttribute('cx', cx); hc.setAttribute('cy', cy); hc.setAttribute('r', subR * 0.5);
        hc.setAttribute('fill', 'none'); hc.setAttribute('stroke', '#21262d'); hc.setAttribute('stroke-width', '0.3');
        svg.appendChild(hc);
        drawFn(cx, cy);
        if (opts && opts.showNormal && normal) {
            const nAz = Math.atan2(normal.x, -normal.z) * 180 / Math.PI;
            const nAzDeg = ((nAz % 360) + 360) % 360;
            const a = (nAzDeg - 90) * Math.PI / 180;
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', cx); line.setAttribute('y1', cy);
            line.setAttribute('x2', cx + (subR + 5) * Math.cos(a));
            line.setAttribute('y2', cy + (subR + 5) * Math.sin(a));
            line.setAttribute('stroke', '#f0f0f0'); line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '2,2'); line.setAttribute('opacity', '0.6');
            svg.appendChild(line);
        }
    }

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;gap:6px;align-items:flex-start;justify-content:center';

    const activeTypes = ATTACK_TYPES;

    for (const typeDef of activeTypes) {
        const key = typeDef.key;
        const maxExp = Math.max(...scores.map(d => d.types[key]), 0.001);

        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', subSize); svg.setAttribute('height', subSize);
        svg.setAttribute('viewBox', `0 0 ${subSize} ${subSize}`);

        drawCompass(svg, (cx, cy) => {
            for (const d of scores) {
                const exposure = d.types[key];
                if (exposure <= 0) continue;
                const val = exposure / maxExp;
                if (val < 0.005) continue;
                const angle = (d.azimuth - 90) * Math.PI / 180;
                const halfA = 2.5 * Math.PI / 180;
                const r = val * subR;
                const pts = [
                    `${cx},${cy}`,
                    `${cx + r * Math.cos(angle - halfA)},${cy + r * Math.sin(angle - halfA)}`,
                    `${cx + r * Math.cos(angle + halfA)},${cy + r * Math.sin(angle + halfA)}`
                ].join(' ');
                const poly = document.createElementNS(ns, 'polygon');
                poly.setAttribute('points', pts);
                poly.setAttribute('fill', typeDef.color);
                poly.setAttribute('opacity', '0.85');
                const tip = document.createElementNS(ns, 'title');
                tip.textContent = `${d.azimuth}°: ${(exposure * 100).toFixed(1)}%`;
                poly.appendChild(tip);
                svg.appendChild(poly);
            }
        }, { showNormal: typeDef === activeTypes[0] });

        const subWrap = document.createElement('div');
        subWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center';
        subWrap.appendChild(svg);
        const label = document.createElement('div');
        label.style.cssText = `font-size:9px;color:${typeDef.color};text-align:center;margin-top:2px;font-weight:600`;
        label.textContent = window.I18N[typeDef.key];
        subWrap.appendChild(label);
        topRow.appendChild(subWrap);
    }

    const bigSize = 190;
    const bigR = 78;
    const maxComb = Math.max(...scores.map(d => d.combined), 0.001);

    const bigSvg = document.createElementNS(ns, 'svg');
    bigSvg.setAttribute('width', bigSize); bigSvg.setAttribute('height', bigSize);
    bigSvg.setAttribute('viewBox', `0 0 ${bigSize} ${bigSize}`);

    const bgC = document.createElementNS(ns, 'circle');
    bgC.setAttribute('cx', bigSize / 2); bgC.setAttribute('cy', bigSize / 2); bgC.setAttribute('r', bigR);
    bgC.setAttribute('fill', 'rgba(13,17,23,0.5)'); bgC.setAttribute('stroke', '#30363d'); bgC.setAttribute('stroke-width', '1');
    bigSvg.appendChild(bgC);

    for (const pct of [0.25, 0.5, 0.75]) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', bigSize / 2); c.setAttribute('cy', bigSize / 2); c.setAttribute('r', bigR * pct);
        c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#21262d'); c.setAttribute('stroke-width', '0.4');
        bigSvg.appendChild(c);
    }

    for (const d of scores) {
        const cval = d.combined / maxComb;
        if (cval < 0.005) continue;
        const angle = (d.azimuth - 90) * Math.PI / 180;
        const halfA = 2.5 * Math.PI / 180;
        const cosA1 = Math.cos(angle - halfA);
        const sinA1 = Math.sin(angle - halfA);
        const cosA2 = Math.cos(angle + halfA);
        const sinA2 = Math.sin(angle + halfA);

        let r0 = 0;
        for (const t of ATTACK_TYPES) {
            const w = d.weights[t.key];
            if (!w || w <= 0) continue;
            const r1 = r0 + (w / maxComb) * bigR;
            const pts = [
                `${bigSize / 2 + r0 * cosA1},${bigSize / 2 + r0 * sinA1}`,
                `${bigSize / 2 + r1 * cosA1},${bigSize / 2 + r1 * sinA1}`,
                `${bigSize / 2 + r1 * cosA2},${bigSize / 2 + r1 * sinA2}`,
                `${bigSize / 2 + r0 * cosA2},${bigSize / 2 + r0 * sinA2}`
            ].join(' ');
            const seg = document.createElementNS(ns, 'polygon');
            seg.setAttribute('points', pts);
            seg.setAttribute('fill', t.color);
            seg.setAttribute('opacity', '0.85');
            const tip = document.createElementNS(ns, 'title');
            const pct = (d.combined * 100).toFixed(1);
            const tPct = (w * 100).toFixed(1);
            tip.textContent = `${d.azimuth}°: ${pct}% · ${window.I18N[t.key]}: ${tPct}%`;
            seg.appendChild(tip);
            bigSvg.appendChild(seg);
            r0 = r1;
        }
    }

    const I = window.I18N;
    const dirs = [
        { label: I.compassN || 'N', angle: 0 },
        { label: I.compassE || 'E', angle: 90 },
        { label: I.compassS || 'S', angle: 180 },
        { label: I.compassW || 'W', angle: 270 }
    ];
    for (const c of dirs) {
        const a = (c.angle - 90) * Math.PI / 180;
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', bigSize / 2 + (bigR + 12) * Math.cos(a));
        txt.setAttribute('y', bigSize / 2 + (bigR + 12) * Math.sin(a));
        txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
        txt.setAttribute('fill', '#8b949e'); txt.setAttribute('font-size', '11'); txt.setAttribute('font-weight', '700');
        txt.textContent = c.label;
        bigSvg.appendChild(txt);
    }

    const bigWrap = document.createElement('div');
    bigWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin-top:4px';
    bigWrap.appendChild(bigSvg);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center';
    wrapper.appendChild(topRow);
    if (activeTypes.length > 0) {
        const sep = document.createElement('hr');
        sep.className = 'dd-sep';
        wrapper.appendChild(sep);
        wrapper.appendChild(bigWrap);
    }
    container.appendChild(wrapper);
}
