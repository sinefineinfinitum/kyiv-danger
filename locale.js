const LOCALES = {
    uk: {
        title: 'Поле ймовірностей атак',
        menu: 'Меню',
        sidebarTitle: 'Поле ймовірностей',
        disclaimer: 'Увага: Це математичне моделювання, результати не гарантовано. Прогноз має ознайомлювальний характер і не є підставою для ігнорування офіційних сигналів повітряної тривоги.',
        count: 'Кількість',
        direction: 'Напрямок',
        totalObjects: 'Всього обʼєктів',
        loading: 'Завантаження моделі...',
        loadError: 'Помилка завантаження моделі',

        drone: 'Дрони',
        droneFull: 'Дрони (10°)',
        missile: 'Крилаті ракети',
        missileFull: 'Крилаті ракети (40°)',
        ballistic: 'Балістичні ракети',
        ballisticFull: 'Балістичні ракети (60°)',

        openToAttack: '▸ відкрито до атаки',
        closedByBuilding: '▸ недоступний для атаки',
        mouseHint: '{lmb} ЛМК — фокус · {rmb} ПМК — фасад',
        controlsHint: '{lmb} ЛМК — фокус камери\n{rmb} ПМК — вибір фасаду\nEsc — скасувати вибір фасаду',

        zoomIn: 'Приблизити',
        zoomOut: 'Віддалити',
        facadeTitle: 'Аналіз фасаду',
        facadeHint: '{lmb} ЛМК — фокус камери · {rmb} ПМК — вибір фасаду',
        dangerRelative: 'небезпека відносно середньої по місту',
        dangerSpot: 'Небезпека ділянки',
        dangerCityAvg: 'Середня по місту',

        aboutTitle: 'Про модель',
        aboutText: 'Принципи моделі:\n• Загроза летить під кутом до горизонту (дрони 10°, крилаті 40°, балістичні 60°) з вибраного напрямку\n• Фасад відкритий, якщо він дивиться в бік загрози\n• Сусідні будівлі закривають фасад — це перевіряється 4 променями від кутів квадратної ділянки 10×10 м\n• Зона ураження симетрична — ділянка квадратна\n• Скоринг 0–1: частина відкритих кутів × кут нахилу фасаду\n• Одинакова орієнтація + відкритість = однаковий score, незалежно від розміру будівлі\n• Розмір будівлі не враховується — тільки відкритість фасаду\n• Середня по місту — арифметичне середній усіх скорів\n• Геометрія з GLB-моделі',

        compassN: 'Пн',
        compassE: 'Сх',
        compassS: 'Пд',
        compassW: 'Зх',
        directionDiagram: 'Ймовірність за напрямками',
        openMap: 'На карті',
        openMapTitle: 'Мапа напрямків загрози',
        openMapCoord: 'Координати',
        openMapThreat: 'Напрям загрози',
    },
    ru: {
        title: 'Поле вероятностей атак',
        menu: 'Меню',
        sidebarTitle: 'Поле вероятностей',
        disclaimer: 'Внимание: Это математическое моделирование, результаты не гарантированы. Прогноз носит ознакомительный характер и не является основанием для игнорирования официальных сигналов воздушной тревоги.',
        count: 'Количество',
        direction: 'Направление',
        totalObjects: 'Всего объектов',
        loading: 'Загрузка модели...',
        loadError: 'Ошибка загрузки модели',

        drone: 'Дроны',
        droneFull: 'Дроны (10°)',
        missile: 'Крылатые ракеты',
        missileFull: 'Крылатые ракеты (40°)',
        ballistic: 'Балистические ракеты',
        ballisticFull: 'Балистические ракеты (60°)',

        openToAttack: '▸ открыто к атаке',
        closedByBuilding: '▸ недоступен для атаки',
        mouseHint: '{lmb} ЛКМ — фокус · {rmb} ПКМ — фасад',
        controlsHint: '{lmb} ЛКМ — фокус камеры\n{rmb} ПКМ — выбор фасада\nEsc — отменить выбор фасада',

        zoomIn: 'Приблизить',
        zoomOut: 'Отдалить',

        facadeTitle: 'Анализ фасада',
        facadeHint: '{lmb} ЛКМ — фокус камеры · {rmb} ПКМ — выбор фасада',
        dangerRelative: 'опасность относительно средней по городу',
        dangerSpot: 'Опасность участка',
        dangerCityAvg: 'Средняя по городу',

        aboutTitle: 'О модели',
        aboutText: 'Принципы модели:\n• Угроза летит под углом к горизонту (дроны 10°, крылатые 40°, баллистические 60°) из выбранного направления\n• Фасад открыт, если он смотрит в сторону угрозы\n• Соседние здания закрывают фасад — проверяется 4 лучами от углов квадратного участка 10×10 м\n• Зона поражения симметрична — участок квадратный\n• Скоринг 0–1: доля открытых углов × угол наклона фасада\n• Одинаковая ориентация + открытость = одинаковый score, независимо от размера здания\n• Размер здания не учитывается — только открытость фасада\n• Средняя по городу — арифметическое среднее всех скоров\n• Геометрия из GLB-модели',

        compassN: 'С',
        compassE: 'В',
        compassS: 'Ю',
        compassW: 'З',
        directionDiagram: 'Вероятность по направлениям',
        openMap: 'На карте',
        openMapTitle: 'Карта направлений угрозы',
        openMapCoord: 'Координаты',
        openMapThreat: 'Направление угрозы',
    },
    en: {
        title: 'Attack Probability Field',
        menu: 'Menu',
        sidebarTitle: 'Probability Field',
        disclaimer: 'Warning: This is a mathematical simulation, results are not guaranteed. The forecast is for reference only and does not constitute grounds for ignoring official air raid warnings.',
        count: 'Count',
        direction: 'Direction',
        totalObjects: 'Total objects',
        loading: 'Loading model...',
        loadError: 'Error loading model',

        drone: 'Drones',
        droneFull: 'Drones (10°)',
        missile: 'Cruise Missiles',
        missileFull: 'Cruise Missiles (40°)',
        ballistic: 'Ballistic Missiles',
        ballisticFull: 'Ballistic Missiles (60°)',

        openToAttack: '▸ open to attack',
        closedByBuilding: '▸ inaccessible to attack',
        mouseHint: '{lmb} LMB — focus · {rmb} RMB — facade',
        controlsHint: '{lmb} LMB — camera focus\n{rmb} RMB — select facade\nEsc — cancel facade selection',

        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',

        facadeTitle: 'Facade Analysis',
        facadeHint: '{lmb} LMB — camera focus · {rmb} RMB — select facade',
        dangerRelative: 'danger relative to city average',
        dangerSpot: 'Spot Danger',
        dangerCityAvg: 'City Average',

        aboutTitle: 'About the Model',
        aboutText: 'Model principles:\n• Threat flies at an angle to the horizon (drones 10°, cruise 40°, ballistic 60°) from the selected direction\n• Facade is exposed if it faces the threat\n• Neighbouring buildings block the facade — checked via 4 rays from corners of a 10×10 m square patch\n• Damage zone is symmetric — patch is square\n• Score 0–1: share of open corners × facade tilt angle\n• Same orientation + openness = same score, regardless of building size\n• Building size is not factored in — only facade exposure\n• City average is the arithmetic mean of all scores\n• Geometry from GLB model',

        compassN: 'N',
        compassE: 'E',
        compassS: 'S',
        compassW: 'W',
        directionDiagram: 'Direction Probability',
        openMap: 'Map',
        openMapTitle: 'Threat Direction Map',
        openMapCoord: 'Coordinates',
        openMapThreat: 'Threat direction',
    }
};

let currentLang = localStorage.getItem('lang') || 'uk';
window.I18N = LOCALES[currentLang];

const _mbtn = (side) =>
    `<svg class="mbtn" viewBox="0 0 14 22" width="9" height="14"><rect x="1" y="1" width="12" height="20" rx="6" stroke="currentColor" stroke-width="1.2" fill="none"/><line x1="7" y1="1" x2="7" y2="12" stroke="currentColor" stroke-width="0.8" opacity="0.3"/><rect x="${side === 'l' ? 2 : 8}" y="2" width="4" height="7" rx="2" fill="currentColor" opacity="0.6"/></svg>`;

function applyI18N() {
    window.I18N = LOCALES[currentLang];
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const val = I18N[el.dataset.i18n];
        if (val) {
            if (val.includes('{lmb}') || val.includes('{rmb}')) {
                el.innerHTML = val.replace(/\{lmb\}/g, _mbtn('l')).replace(/\{rmb\}/g, _mbtn('r'));
            } else {
                el.textContent = val;
            }
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = I18N[el.dataset.i18nTitle] || el.title;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', I18N[el.dataset.i18nAria] || el.getAttribute('aria-label'));
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
}

function switchLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyI18N();
    if (typeof rebuildAttacks === 'function') rebuildAttacks();
    document.querySelectorAll('.compass-wrap svg').forEach(svg => svg.remove());
    createCompass('drone');
    createCompass('missile');
    createCompass('ballistic');
}

window.switchLang = switchLang;
window.applyI18N = applyI18N;
