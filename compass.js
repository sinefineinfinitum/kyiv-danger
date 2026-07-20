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
    cityG.setAttribute('opacity', '0.5');

    const kyivPath = document.createElementNS(ns, 'path');
    kyivPath.setAttribute('d', 'M11.47,60.66L11.03,59.99L11.71,59.18L12.12,59.01L12.82,58.16L12.84,57.86L12.74,57.43L12.35,57.16L11.74,56.48L11.66,55.88L11.88,55.46L12.02,55.22L12.32,54.91L12.88,54.28L13.48,53.82L13.78,53.57L14.26,53.15L15.04,52.17L14.34,52.03L13.47,51.83L13.45,51.41L13.61,51.08L13.74,50.93L13.81,50.67L13.80,50.44L13.77,50.35L13.80,50.23L13.83,49.93L13.92,49.71L14.04,49.53L14.24,49.48L14.58,49.53L14.93,49.53L15.03,49.53L15.23,49.44L15.52,49.32L15.94,49.22L15.87,49.16L15.86,49.12L16.42,48.52L16.42,48.30L16.39,48.15L16.59,47.99L17.21,47.40L17.24,47.29L17.26,46.66L17.11,46.52L15.77,45.63L15.41,45.21L15.94,44.58L16.29,44.21L16.55,43.99L16.79,43.80L17.19,43.59L17.54,43.47L17.66,43.30L17.81,43.22L18.08,43.13L18.58,43.13L18.97,43.05L19.38,42.96L19.71,42.80L20.19,42.45L20.74,42.25L21.02,42.07L20.95,41.66L22.18,41.03L22.78,40.87L23.18,40.73L23.39,39.65L23.01,38.44L23.26,38.33L22.81,38.07L22.22,37.63L22.32,37.11L23.01,37.30L23.76,37.11L24.37,37.01L24.68,36.99L24.77,37.02L25.81,37.63L26.62,38.10L27.50,38.33L27.44,37.91L27.91,38.01L28.07,38.01L28.27,37.92L28.66,37.69L28.54,37.62L28.32,37.35L28.32,37.14L28.40,37.00L28.48,36.86L28.79,36.63L29.25,36.75L30.07,36.77L29.64,36.34L28.47,36.22L27.57,35.41L27.40,35.19L25.95,34.72L24.01,34.17L27.09,33.85L31.44,33.56L33.34,33.59L34.15,33.60L35.61,33.23L35.62,32.02L36.78,31.26L39.82,31.28L43.94,31.32L48.07,31.35L49.08,31.36L49.63,31.37L50.89,31.52L52.37,31.70L52.59,32.20L52.81,33.94L54.15,33.88L54.29,33.88L55.53,33.86L56.54,34.39L56.26,34.55L56.39,34.67L57.51,34.70L58.15,34.85L58.99,37.09L61.62,38.51L64.19,39.53L65.38,39.85L66.33,40.41L67.43,41.71L66.77,42.83L67.74,43.01L68.46,43.04L69.41,43.12L69.85,43.47L70.19,43.91L70.68,44.12L71.54,44.02L71.56,43.88L71.50,43.79L71.53,43.65L71.60,43.55L71.73,43.39L71.72,43.27L71.58,43.08L71.28,42.76L71.12,42.54L70.98,42.46L70.88,42.41L70.74,42.30L70.64,42.20L70.47,42.07L70.39,42.00L70.40,41.96L70.15,41.84L69.99,41.73L69.86,41.74L69.71,41.70L69.62,41.68L69.55,41.65L69.40,41.62L69.34,41.55L69.25,41.48L69.18,41.46L69.18,41.37L69.14,41.31L69.07,41.16L69.05,41.07L69.08,40.94L69.01,40.86L68.92,40.77L68.97,40.60L69.01,40.47L69.01,40.38L69.18,40.27L69.24,40.21L69.34,40.18L69.48,40.07L69.59,39.87L71.00,39.92L72.94,40.18L76.49,40.43L82.61,40.70L87.47,40.82L87.78,39.96L88.75,38.90L89.04,38.36L89.20,37.81L90.39,37.24L90.87,37.24L91.16,37.18L92.43,36.86L93.80,36.34L94.68,36.02L94.83,35.96L95.07,35.87L95.25,35.81L95.30,35.79L95.42,35.74L95.48,36.09L95.69,37.07L98.44,36.89L98.20,35.61L97.40,33.75L99.79,31.36L99.51,31.17L99.21,30.81L99.22,30.57L99.50,30.46L100.32,30.58L102.04,30.97L105.15,31.71L106.80,31.74L108.26,32.14L110.17,33.04L110.91,32.68L111.32,32.52L112.07,32.96L112.42,33.39L112.64,33.57L113.22,33.96L114.18,34.38L116.33,35.07L117.11,35.51L116.81,35.59L116.82,35.88L116.74,36.40L117.57,37.29L117.89,38.87L118.06,39.77L117.75,40.49L117.11,40.71L115.64,40.93L114.64,41.40L113.47,41.63L112.81,41.79L111.49,42.04L110.06,42.47L108.18,43.12L107.24,43.31L106.29,43.55L105.48,43.68L105.79,44.03L106.14,44.29L106.72,44.60L107.16,44.92L107.18,45.12L106.82,45.53L106.44,45.45L105.79,45.83L104.89,46.23L104.98,46.40L105.04,46.52L105.14,46.62L105.00,46.66L104.33,46.69L104.27,46.50L104.18,46.57L104.06,46.77L103.32,47.10L102.76,47.27L103.00,47.44L103.55,48.57L103.22,48.69L103.54,48.67L103.80,48.80L103.87,48.69L104.44,48.54L104.72,49.09L105.02,49.31L105.32,49.28L105.60,49.06L105.83,48.86L106.09,49.11L106.32,50.13L105.79,50.17L104.79,50.03L104.42,50.92L104.91,51.64L104.31,52.23L103.50,52.81L103.75,52.75L104.17,52.71L104.96,52.62L105.70,52.74L105.18,53.56L105.50,53.85L104.96,54.42L103.67,54.67L106.68,56.45L108.31,57.00L109.89,57.53L109.81,58.08L110.13,58.40L110.72,58.63L112.12,59.25L112.55,59.24L112.68,59.17L113.40,59.72L113.48,59.85L113.77,60.07L114.25,60.36L114.30,60.64L114.14,60.80L114.31,60.92L114.49,61.08L114.25,61.36L114.23,61.43L114.37,61.55L114.33,61.60L113.62,62.03L113.50,62.11L113.48,62.17L113.56,62.27L113.82,62.55L114.18,62.65L114.76,63.06L114.94,63.19L115.14,63.33L115.62,63.56L115.78,63.61L115.82,63.59L115.90,63.51L116.04,63.40L116.20,63.46L116.37,63.56L116.50,63.60L116.66,63.67L116.87,63.70L117.29,63.75L117.75,63.84L118.00,63.86L118.24,63.95L118.46,64.13L118.80,64.38L118.93,64.49L118.97,64.65L118.26,65.26L117.83,66.13L117.16,66.64L115.42,66.74L113.66,66.45L112.91,66.02L111.36,65.97L109.89,66.27L109.65,66.47L109.76,67.25L109.78,67.29L109.86,67.41L110.58,68.07L108.20,68.79L107.50,69.55L107.10,69.92L105.22,69.92L102.99,70.44L101.17,69.61L100.19,68.91L99.62,68.64L98.96,68.59L98.70,68.84L98.31,69.08L98.04,69.62L98.07,69.71L98.12,69.87L98.25,70.04L98.04,70.31L98.21,70.49L98.52,70.69L98.63,70.98L98.51,71.17L98.12,71.27L97.69,71.22L97.48,71.43L97.24,71.51L97.17,71.65L97.30,71.73L97.44,71.86L97.34,72.04L97.99,72.58L98.40,73.17L98.21,73.69L98.02,73.89L97.23,74.35L95.83,74.82L95.28,75.02L94.86,74.56L94.65,74.55L93.87,74.27L92.69,73.94L91.74,73.82L91.47,73.18L90.38,72.92L90.77,71.72L90.82,71.48L92.16,70.62L91.86,70.73L91.51,70.89L91.08,70.87L90.95,70.81L89.16,71.49L87.08,72.20L85.64,72.30L84.33,72.52L84.58,72.77L84.63,73.02L84.70,73.71L83.95,76.00L84.21,76.30L84.92,76.52L84.09,76.66L83.72,76.26L83.06,75.86L82.61,75.39L82.45,74.97L82.24,74.74L81.73,74.74L80.63,74.80L80.22,74.89L79.67,75.19L79.70,75.22L79.74,75.26L79.84,75.36L79.91,75.44L79.96,75.50L80.02,75.53L80.08,75.61L80.15,75.70L80.15,75.75L80.18,75.75L80.20,75.74L80.20,75.76L80.19,75.78L80.25,75.79L80.28,75.87L80.31,75.88L80.29,75.90L80.29,75.90L80.29,75.93L80.29,75.94L80.39,76.05L80.40,76.05L80.35,76.08L80.41,76.11L80.41,76.12L80.44,76.15L80.49,76.26L80.38,76.49L80.43,77.32L81.90,78.96L82.60,80.48L84.36,81.91L86.04,83.97L86.60,85.21L90.83,87.63L90.09,88.36L87.93,89.50L86.71,88.48L83.15,87.26L80.33,87.21L79.34,87.57L79.56,87.82L79.65,87.98L79.55,88.13L79.63,88.25L79.81,88.35L80.14,88.65L80.39,88.83L80.52,89.30L80.96,90.10L81.40,90.17L82.41,90.48L82.13,90.83L82.18,90.97L82.18,91.50L82.31,91.76L82.74,91.94L82.87,91.98L83.59,92.97L84.01,93.64L84.74,94.03L85.05,94.22L85.27,94.33L85.64,94.53L85.79,94.78L85.43,95.23L84.34,95.50L85.36,96.92L76.34,99.53L75.94,97.91L75.90,96.63L75.40,94.80L75.06,93.66L73.24,91.24L72.92,91.09L72.03,90.58L71.82,90.24L71.23,89.52L70.98,89.26L69.16,89.09L68.25,88.74L67.29,87.78L67.82,85.80L65.45,85.46L65.26,85.42L64.34,85.36L65.30,84.47L65.40,84.17L65.07,83.26L65.23,81.73L65.27,80.76L64.50,80.29L62.72,79.95L61.15,79.07L60.03,79.19L58.83,79.57L57.77,79.15L57.21,78.57L58.05,78.28L58.80,77.72L57.98,77.51L56.76,77.12L56.49,77.14L56.21,77.41L55.58,77.56L54.59,77.26L55.00,76.95L55.27,76.72L54.93,76.43L54.54,76.28L54.39,75.84L54.35,74.80L53.46,74.05L53.80,73.33L53.33,72.89L53.47,72.67L53.02,72.64L52.59,72.58L52.08,72.53L51.85,72.52L51.23,72.63L50.90,73.01L50.76,73.37L50.72,73.48L50.52,73.67L50.20,73.61L48.03,73.29L47.84,73.25L47.88,72.88L47.90,72.73L47.89,72.66L47.52,72.51L47.73,71.90L47.82,71.30L46.85,70.76L47.09,70.07L48.20,69.13L48.70,68.72L46.19,66.88L45.95,67.01L45.72,66.98L45.01,66.57L45.05,66.31L45.07,66.10L44.66,66.13L44.43,66.07L44.13,66.05L44.49,65.91L44.26,65.79L43.52,65.48L43.00,65.31L42.50,65.15L42.05,65.03L41.84,64.96L40.85,64.62L40.10,64.37L39.82,64.25L39.56,64.12L39.11,63.84L38.95,63.74L38.77,63.63L38.48,63.45L38.26,63.32L37.93,63.09L37.63,62.91L37.45,62.80L37.13,62.59L36.60,62.25L36.20,62.01L35.73,61.72L35.50,61.55L35.29,61.36L35.05,61.16L34.89,61.15L34.71,60.95L34.67,60.94L34.76,60.91L34.85,60.81L34.67,60.57L34.40,60.24L34.12,59.88L33.93,59.62L33.73,59.33L33.66,59.17L33.63,59.02L33.55,58.55L33.50,58.27L33.46,57.99L33.41,57.67L33.37,57.41L33.33,57.18L33.27,57.10L33.23,57.10L32.07,56.90L31.63,56.36L31.50,56.15L31.37,56.25L31.42,56.34L31.46,56.42L31.53,56.49L31.72,56.83L31.59,56.98L30.80,56.98L29.47,57.12L27.17,57.47L26.74,57.60L26.39,57.58L25.36,57.61L24.75,57.52L23.95,57.41L22.52,57.18L19.28,56.71L19.34,57.46L19.29,57.63L19.14,57.90L18.84,58.44L18.22,59.31L18.34,59.75L17.50,60.30L15.63,59.78L14.50,59.69L14.35,59.88L13.64,60.56L12.10,60.79L11.78,60.80L11.47,60.66M26.05,48.01L26.10,47.95L26.16,47.89L26.23,47.83L27.30,48.41L29.07,48.27L29.50,47.72L29.85,47.52L30.00,47.39L30.01,47.67L30.38,47.52L31.00,47.32L31.03,48.58L30.88,48.64L31.48,49.66L30.78,49.38L30.44,49.50L30.78,50.00L30.05,50.10L29.50,49.80L29.34,50.14L27.80,49.89L27.51,49.80L27.18,49.69L26.81,49.59L26.50,49.51L26.49,49.38L26.35,48.78L26.01,48.61L25.92,48.16L25.98,48.08L26.05,48.01M99.85,43.05L100.22,45.01L101.62,44.79L102.99,44.26L103.63,44.03L104.14,43.93L105.41,43.64L105.38,43.36L105.31,43.07L105.27,42.84L104.08,42.66L102.84,42.80L102.31,42.83L100.67,42.99L100.05,43.04L99.87,43.05L99.85,43.05');
    kyivPath.setAttribute('fill', '#8b949e');
    kyivPath.setAttribute('stroke', '#8b949e');
    kyivPath.setAttribute('stroke-width', '1.5');
    kyivPath.setAttribute('opacity', '0.5');
    cityG.appendChild(kyivPath);

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
