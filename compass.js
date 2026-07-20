const COMPASS_COLORS = { drone: '#f0883e', missile: '#58a6ff', ballistic: '#f85149' };
const COMPASS_HANDLERS = {};
const COMPASS_SIZE = 130;
const CX = COMPASS_SIZE / 2;
const CY = COMPASS_SIZE / 2;
const R_OUTER = 58;
const R_LABEL = 50;

function createCompass(type) {
    const color = COMPASS_COLORS[type];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', COMPASS_SIZE);
    svg.setAttribute('height', COMPASS_SIZE);
    svg.setAttribute('viewBox', `0 0 ${COMPASS_SIZE} ${COMPASS_SIZE}`);

    const defs = document.createElementNS(ns, 'defs');
    const grad = document.createElementNS(ns, 'radialGradient');
    grad.id = `cg-${type}`;
    grad.innerHTML = `<stop offset="0%" stop-color="${color}" stop-opacity="0.08"/><stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>`;
    defs.appendChild(grad);
    svg.appendChild(defs);

    const bg = document.createElementNS(ns, 'circle');
    bg.setAttribute('cx', CX);
    bg.setAttribute('cy', CY);
    bg.setAttribute('r', R_OUTER);
    bg.setAttribute('fill', `url(#cg-${type})`);
    bg.setAttribute('stroke', '#30363d');
    bg.setAttribute('stroke-width', '1.5');
    svg.appendChild(bg);

    for (let i = 0; i < 36; i++) {
        const a = (i * 10 - 90) * Math.PI / 180;
        const r1 = i % 9 === 0 ? R_OUTER - 8 : (i % 3 === 0 ? R_OUTER - 5 : R_OUTER - 3);
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', CX + r1 * Math.cos(a));
        line.setAttribute('y1', CY + r1 * Math.sin(a));
        line.setAttribute('x2', CX + (R_OUTER - 1) * Math.cos(a));
        line.setAttribute('y2', CY + (R_OUTER - 1) * Math.sin(a));
        line.setAttribute('stroke', i % 9 === 0 ? '#8b949e' : '#484f58');
        line.setAttribute('stroke-width', i % 9 === 0 ? '1.5' : '0.5');
        svg.appendChild(line);
    }

    const dirs = [
        { label: I18N.compassN, angle: 0 },
        { label: I18N.compassE, angle: 90 },
        { label: I18N.compassS, angle: 180 },
        { label: I18N.compassW, angle: 270 }
    ];
    for (const d of dirs) {
        const a = (d.angle - 90) * Math.PI / 180;
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', CX + R_LABEL * Math.cos(a));
        txt.setAttribute('y', CY + R_LABEL * Math.sin(a));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'central');
        txt.setAttribute('fill', '#c9d1d9');
        txt.setAttribute('font-size', '11');
        txt.setAttribute('font-weight', '700');
        txt.setAttribute('font-family', 'Segoe UI, sans-serif');
        txt.textContent = d.label;
        svg.appendChild(txt);
    }

    const cityG = document.createElementNS(ns, 'g');
    cityG.setAttribute('opacity', '0.3');

    const kyivPath = document.createElementNS(ns, 'path');
    kyivPath.setAttribute('d', 'M45.0,64.0 L48.7,61.7 L55.9,66.6 L60.9,72.1 L65.4,78.0 L67.6,83.2 L71.9,85.0 L72.1,81.9 L70.9,74.9 L72.5,74.5 L75.5,70.8 L77.0,73.5 L77.8,70.7 L79.6,70.7 L83.1,67.6 L84.4,66.1 L83.8,63.9 L79.9,60.2 L80.2,57.6 L79.8,56.2 L80.3,54.5 L81.8,52.3 L85.0,48.1 L82.6,45.5 L77.7,46.4 L74.6,48.7 L66.8,51.0 L67.6,52.1 L67.7,53.2 L65.5,50.4 L60.6,45.0 L50.5,46.4 L51.5,48.5 L50.5,48.7 L49.7,49.7 L48.2,52.3 L46.9,53.3 L47.0,55.9 L46.1,56.8 L45.9,58.2 L45.2,61.1 L45.0,63.7Z');
    kyivPath.setAttribute('fill', '#8b949e');
    kyivPath.setAttribute('stroke', '#8b949e');
    kyivPath.setAttribute('stroke-width', '0.5');
    cityG.appendChild(kyivPath);

    const river = document.createElementNS(ns, 'path');
    river.setAttribute('d', 'M65.5,50.4 L67.7,53.2 L67.6,52.1 L66.8,51.0 L74.6,48.7 L77.7,46.4 L79.8,56.2 L80.2,57.6 L79.9,60.2 L83.8,63.9 L84.4,66.1');
    river.setAttribute('fill', 'none');
    river.setAttribute('stroke', '#0d1117');
    river.setAttribute('stroke-width', '1.2');
    river.setAttribute('stroke-linecap', 'round');
    river.setAttribute('opacity', '0.5');
    cityG.appendChild(river);

    svg.appendChild(cityG);

    const pointer = document.createElementNS(ns, 'g');
    pointer.id = `pointer-${type}`;

    const pinR = R_OUTER - 12;
    const pin = document.createElementNS(ns, 'polygon');
    pin.setAttribute('points', [
        `${CX},${CY - pinR}`,
        `${CX - 5},${CY - pinR + 10}`,
        `${CX + 5},${CY - pinR + 10}`
    ].join(' '));
    pin.setAttribute('fill', color);
    pin.setAttribute('stroke', '#0d1117');
    pin.setAttribute('stroke-width', '1');

    const tgtR = R_OUTER - 14;
    const tgt = document.createElementNS(ns, 'polygon');
    tgt.setAttribute('points', [
        `${CX},${CY + tgtR - 8}`,
        `${CX - 4},${CY + tgtR}`,
        `${CX + 4},${CY + tgtR}`
    ].join(' '));
    tgt.setAttribute('fill', 'none');
    tgt.setAttribute('stroke', color);
    tgt.setAttribute('stroke-width', '1.2');
    tgt.setAttribute('opacity', '0.6');

    const axis = document.createElementNS(ns, 'line');
    axis.setAttribute('x1', CX);
    axis.setAttribute('y1', CY - pinR + 10);
    axis.setAttribute('x2', CX);
    axis.setAttribute('y2', CY + tgtR - 8);
    axis.setAttribute('stroke', color);
    axis.setAttribute('stroke-width', '0.8');
    axis.setAttribute('opacity', '0.4');

    const pinDot = document.createElementNS(ns, 'circle');
    pinDot.setAttribute('cx', CX);
    pinDot.setAttribute('cy', CY);
    pinDot.setAttribute('r', '3');
    pinDot.setAttribute('fill', color);

    pointer.appendChild(axis);
    pointer.appendChild(pin);
    pointer.appendChild(tgt);
    pointer.appendChild(pinDot);
    svg.appendChild(pointer);

    document.getElementById(`compass-${type}`).appendChild(svg);

    // Cleanup previous window listeners for this type to prevent leaks
    const prev = COMPASS_HANDLERS[type];
    if (prev) {
        window.removeEventListener('mousemove', prev.onMove);
        window.removeEventListener('touchmove', prev.onTouchMove, { passive: false });
        window.removeEventListener('mouseup', prev.onUp);
        window.removeEventListener('touchend', prev.onEnd);
    }

    let dragging = false;

    function angleFromEvent(e) {
        const rect = svg.getBoundingClientRect();
        const mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const my = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        let a = Math.atan2(mx - CX, -(my - CY)) * 180 / Math.PI;
        if (a < 0) a += 360;
        return Math.round(a) % 360;
    }

    function setAngle(deg) {
        deg = ((deg % 360) + 360) % 360;
        document.getElementById(`${type}-az`).value = deg;
        pointer.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);
        pointer.dataset.angle = deg;
        document.getElementById(`${type}-az`).dispatchEvent(new Event('input', { bubbles: true }));
    }

    function onMouseDown(e) { dragging = true; setAngle(angleFromEvent(e)); e.preventDefault(); }
    function onTouchStart(e) { dragging = true; setAngle(angleFromEvent(e)); e.preventDefault(); }
    function onMove(e) { if (dragging) setAngle(angleFromEvent(e)); }
    function onTouchMove(e) { if (dragging) setAngle(angleFromEvent(e)); }
    function onUp() { dragging = false; }
    function onEnd() { dragging = false; }

    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onEnd);

    COMPASS_HANDLERS[type] = { onMove, onTouchMove, onUp, onEnd };

    setAngle(0);

    document.getElementById(`${type}-az`).addEventListener('input', function() {
        let deg = parseInt(this.value, 10);
        if (isNaN(deg) || deg < 0) { deg = 0; this.value = 0; }
        if (deg > 359) { deg = 359; this.value = 359; }
        pointer.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);
        pointer.dataset.angle = deg;
    });
}
