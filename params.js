const state = {
    drone: { count: 0, azDeg: 0 },
    missile: { count: 0, azDeg: 0 },
    ballistic: { count: 0, azDeg: 0 },
};

export function setParams(type, count, azDeg) {
    if (isNaN(count) || count < 0) count = 0;
    if (count > 50) count = 50;
    if (isNaN(azDeg)) azDeg = 0;
    azDeg = Math.max(0, Math.min(359, Math.round(azDeg)));
    state[type].count = count;
    state[type].azDeg = azDeg;
}

export function getCount(type) { return state[type].count; }

export function getAzDeg(type) { return state[type].azDeg; }

export function getAzRad(type) { return state[type].azDeg * Math.PI / 180; }
