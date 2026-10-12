/* Zakupy z przepisów — wersja 1. Dane trzymane wyłącznie w tym telefonie (localStorage). */

const STORE_KEY = 'zakupy.v1';
const APP_VERSION = '1.2.1';
const PONYFILL_URLS = [
  'https://cdn.jsdelivr.net/npm/barcode-detector@3.1.3/dist/es/ponyfill.js',
  'https://fastly.jsdelivr.net/npm/barcode-detector@3.1.3/dist/es/ponyfill.js',
];
const OFF_FIELDS = 'product_name,product_name_pl,brands,quantity,image_front_small_url,image_small_url,image_front_url';
const offUrl = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;

const DEPTS = [
  'Warzywa i owoce', 'Pieczywo', 'Mięso i ryby', 'Nabiał i jaja', 'Mrożonki',
  'Suche, puszki i słoiki', 'Przyprawy i sosy', 'Słodycze i przekąski', 'Napoje', 'Chemia i dom', 'Inne',
];
// Typowa ścieżka klienta w polskim Lidlu: pieczywo i warzywa przy wejściu, potem chłodnie
// wzdłuż ścian (nabiał, mięso, mrożonki), środek sklepu, a przy kasach słodycze i napoje.
const LIDL_ORDER = [
  'Pieczywo', 'Warzywa i owoce', 'Nabiał i jaja', 'Mięso i ryby', 'Mrożonki', 'Suche, puszki i słoiki',
  'Przyprawy i sosy', 'Słodycze i przekąski', 'Napoje', 'Chemia i dom', 'Inne',
];
const RECIPE_KINDS = [
  { cat: 'sniadanie', sub: 'slodkie', label: 'Słodkie śniadanie' },
  { cat: 'sniadanie', sub: 'slone', label: 'Słone śniadanie' },
  { cat: 'obiad', sub: '', label: 'Obiad' },
];
const normCat = (v) => {
  const s = String(v || '').toLowerCase();
  if (/^(śniadanie|sniadanie|śniadania|sniadania|breakfast)/.test(s)) return 'sniadanie';
  if (/^(obiad|obiady|lunch|dinner|kolacja)/.test(s)) return 'obiad';
  return '';
};
const normSub = (v) => {
  const s = String(v || '').toLowerCase();
  if (/^(słodk|slodk|sweet)/.test(s)) return 'slodkie';
  if (/^(słon|slon|savou?ry|salty)/.test(s)) return 'slone';
  return '';
};
const UNIT_SUGGESTIONS = [
  'g', 'kg', 'ml', 'l', 'szt', 'opak.', 'puszka', 'słoik', 'łyżka', 'łyżeczka', 'szklanka',
  'szczypta', 'ząbek', 'plaster', 'garść', 'porcja', 'średnia sztuka', 'średnie opakowanie',
];

/* ---------------------------------------------------------------- helpers */

const $ = (sel, el = document) => el.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const toNum = (v) => {
  if (v === '' || v == null) return null;
  const s = String(v).trim().replace(',', '.');
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const fmtG = (g) => (g >= 1000 ? `${fmtNum(g / 1000)} kg` : `${Math.round(g)} g`);
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  if (n === 1) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const porcje = (n) => (Number.isInteger(n) ? `${n} ${plural(n, 'porcja', 'porcje', 'porcji')}` : `${fmtNum(n)} porcji`);
const skladniki = (n) => `${n} ${plural(n, 'składnik', 'składniki', 'składników')}`;
const UNIT_FORMS = {
  'puszka': ['puszka', 'puszki', 'puszek'], 'słoik': ['słoik', 'słoiki', 'słoików'],
  'butelka': ['butelka', 'butelki', 'butelek'], 'paczka': ['paczka', 'paczki', 'paczek'],
  'opakowanie': ['opakowanie', 'opakowania', 'opakowań'], 'kostka': ['kostka', 'kostki', 'kostek'],
  'główka': ['główka', 'główki', 'główek'], 'pęczek': ['pęczek', 'pęczki', 'pęczków'],
  'karton': ['karton', 'kartony', 'kartonów'], 'sztuka': ['sztuka', 'sztuki', 'sztuk'],
  'bochenek': ['bochenek', 'bochenki', 'bochenków'], 'tabliczka': ['tabliczka', 'tabliczki', 'tabliczek'],
};
const unitFor = (n, u) => { const f = UNIT_FORMS[(u || '').toLowerCase()]; return f ? plural(n, ...f) : u; };
const shortName = (r) => (r.name.split(/\s+/)[0] || r.name).replace(/[,.;:]$/, '');
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
};

/* ------------------------------------------------------------------ dates */

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const DAY_NAMES = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const DAY_ACC = ['poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę', 'niedzielę'];
const DAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const SLOTS = [
  { key: 's', label: 'Śniadanie', acc: 'śniadanie' },
  { key: 'o', label: 'Obiad', acc: 'obiad' },
];
const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
// W sobotę i niedzielę planujesz zwykle kolejny tydzień.
function defaultMonday() {
  const t = new Date();
  const m = mondayOf(t);
  return (t.getDay() === 6 || t.getDay() === 0) ? addDays(m, 7) : m;
}
let weekOffset = 0;
const viewMonday = () => addDays(defaultMonday(), weekOffset * 7);
function weekRange(monday) {
  const sun = addDays(monday, 6);
  return monday.getMonth() === sun.getMonth()
    ? `${monday.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]}`
    : `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
}
const dateShort = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  book: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  basket: '<path d="M3 9h18l-2 11H5z"/><path d="M8 9l4-6 4 6"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 12h10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  paste: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
  save: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
};
const icon = (name, size = 20, sw = 2) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/* ------------------------------------------------------------- dział (aisle) */

const DEPT_RULES = [
  ['Suche, puszki i słoiki', /bułka tarta|mąka|skrobia|makaron|ryż|kasz[aey]|płatki|kukurydza|fasol|ciecierzyc|soczewic|pomidory krojone|passata|koncentrat|tuńczyk|sardyn|kiszon|oliwki|dżem|miód|cukier|orzech|migdał|rodzynk|kakao|herbat|kawa|mleko kokos|wiórki|siemię|nasiona|pestki/],
  ['Przyprawy i sosy', /(^|\s)sól|pieprz|w proszku|granulowan|suszon|oregano|tymianek|cynamon|kurkum|curry|kmin|majeranek|ziele angielskie|liść laurowy|bulion|kostka rosołowa|(^|\s)sos(\s|$)|ketchup|musztard|majonez|ocet|olej|oliwa|przyprawa/],
  ['Pieczywo', /tortill|chleb|bułk|bagietk|(^|\s)pita|wrap|bajgiel|rogal|grzank|pieczywo/],
  ['Mięso i ryby', /mięs|mielon|kurczak|indyk|pierś|udk|wołow|wieprz|schab|boczek|szynk|kiełbas|parówk|łosoś|dorsz|krewet|ryb[aey]|filet|polędwic/],
  ['Nabiał i jaja', /mlek|mleko|jogurt|kefir|maślank|(^|\s)ser(\s|$|ek)|gouda|mozzarell|parmezan|feta|twaróg|twarog|śmietan|masło|jajk|jaja|skyr/],
  ['Mrożonki', /mrożon/],
  ['Warzywa i owoce', /ziemniak|cebul|czosn|marchew|marchw|pietruszk|seler|(^|\s)por(\s|$)|ogór|pomidor|papryk|sałat|rukol|szpinak|kapust|brokuł|kalafior|cukini|bakłażan|dyni|rzodkiew|szczypior|koper|natk|bazyli|mięt|imbir|cytryn|limonk|banan|jabł|grusz|pomarańcz|mandaryn|truskaw|malin|borówk|awokad|grzyb|pieczark|kiełk|winogron|kiwi/],
  ['Słodycze i przekąski', /czekolad|baton|ciastk|ciasteczk|chips|cukierk|żelk|wafel|wafle|herbatnik|paluszk|krakers|popcorn|draż|pralin/],
  ['Napoje', /(^|\s)woda|(^|\s)sok(\s|$)|napój|napoj|cola|piwo|wino(\s|$)/],
  ['Chemia i dom', /papier|płyn|proszek do|kapsułki|gąbk|worki|folia|ręcznik|szampon|mydło|pasta do zębów/],
];
const guessDept = (name) => {
  const n = key(name);
  for (const [dept, re] of DEPT_RULES) if (re.test(n)) return dept;
  return 'Inne';
};

/* ----------------------------------------------------------- line parser */

const ADJ = '(?:(?:mał[aey]|średni[aey]?|duż[aey])\\s+)?';
const UNITS = [
  'kg', 'g', 'ml', 'l', 'szt\\.?', 'sztuk[aiy]?', 'łyżk[aiy]', 'łyżek', 'łyżeczk[aiy]', 'łyżeczek',
  'szklank[aiy]', 'szklanek', 'szczypt[aiy]', 'opakowani[ae]', 'opakowań', 'opak\\.?', 'puszk[aiy]', 'puszek',
  'słoik(?:i|ów)?', 'ząb(?:ek|ki|ków)', 'plaster', 'plastr(?:y|ów)?', 'garść', 'garści', 'porcj[aie]', 'porcji',
  'pęcz(?:ek|ki|ków)', 'kostk[aiy]', 'kostek',
];
const UNIT = `${ADJ}(?:${UNITS.join('|')})`;
const NUM = '(\\d+(?:[.,]\\d+)?|\\d+\\/\\d+)';
const GRAMS = '(?:\\s*\\/\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:g|ml))?';
const RE_QTY_FIRST = new RegExp(`^${NUM}\\s*(${UNIT})?\\s+(.+)$`, 'iu');
const RE_NAME_FIRST = new RegExp(`^(.+?)\\s+${NUM}\\s*(${UNIT})?${GRAMS}$`, 'iu');
const RE_QTY_ONLY = new RegExp(`^${NUM}\\s*(${UNIT})?${GRAMS}$`, 'iu');

function gramsFor(qty, unit, explicit) {
  if (explicit != null) return explicit;
  if (qty == null) return null;
  const u = (unit || '').toLowerCase();
  if (u === 'g' || u === 'ml') return qty;
  if (u === 'kg' || u === 'l') return qty * 1000;
  return null;
}
function makeItem(name, qty, unit, explicitG) {
  const u = (unit || '').trim();
  return { id: uid(), name: name.trim(), brand: '', qty, unit: u, g: gramsFor(qty, u, explicitG) };
}
function parseLine(line) {
  const s = line.replace(/^[-•*]\s*/, '').trim();
  if (!s) return null;
  let m = s.match(RE_QTY_FIRST);
  if (m) return makeItem(m[3], toNum(m[1]), m[2], null);
  m = s.match(RE_NAME_FIRST);
  if (m) return makeItem(m[1], toNum(m[2]), m[3], toNum(m[4]));
  return makeItem(s, null, '', null);
}
function parseLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    const qo = line.match(RE_QTY_ONLY);
    if (qo && prev && prev.qty == null && prev.g == null) {
      prev.qty = toNum(qo[1]);
      prev.unit = (qo[2] || '').trim();
      prev.g = gramsFor(prev.qty, prev.unit, toNum(qo[3]));
      continue;
    }
    const it = parseLine(line);
    if (it) out.push(it);
  }
  return out;
}
function parseQuantityG(q) {
  if (!q) return null;
  const s = String(q).toLowerCase().replace(',', '.');
  const multi = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (multi) return Number(multi[1]) * Number(multi[2]) * (/^(kg|l)$/.test(multi[3]) ? 1000 : 1);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (!m) return null;
  return Number(m[1]) * (/^(kg|l)$/.test(m[2]) ? 1000 : 1);
}

/* -------------------------------------------------------------- seed data */

function seed() {
  const I = (name, brand, qty, unit, g) => ({ id: uid(), name, brand, qty, unit, g });
  const klopsiki = {
    id: 'klopsiki',
    name: "Klopsiki a'la Ikea w sosie z ziemniakami",
    cat: 'obiad',
    servings: 1,
    kcal: 604,
    items: [
      I('Mięso mielone z piersi indyka (do 2% tłuszczu)', '', 1.2, 'porcja', 120),
      I('Cebula', '', 0.2, 'średnia sztuka', 25),
      I('Bułka tarta', '', 1, 'łyżka', 8),
      I('Majonez wegański', 'Go Vege', 0.8, 'łyżeczka', 12),
      I('Koper świeży', '', 1, 'łyżeczka', 5),
      I('Sól', '', 0.2, 'łyżeczka', 1),
      I('Pieprz czarny', '', 1, 'szczypta', 1),
      I('Czosnek w proszku', '', 0.3, 'łyżeczka', 1),
      I('Sos sojowy', '', 0.4, 'łyżka', 4),
      I('Olej rzepakowy', '', 1, 'łyżka', 10),
      I('Masło', '', 0.7, 'łyżeczka', 5),
      I('Mąka pszenna', '', 0.3, 'łyżka', 5),
      I('Skrobia ziemniaczana', '', 0.5, 'łyżeczka', 3),
      I('Bulion wołowy', 'Winiary', 0.4, 'łyżka', 6),
      I('Woda', '', 0.6, 'szklanka', 140),
      I('Czosnek w proszku', '', 0.3, 'łyżeczka', 1),
      I('Mleko 1,5%', '', 0.1, 'szklanka', 15),
      I('Ziemniaki', '', 2.7, 'średnia sztuka', 200),
      I('Ogórek', '', 0.5, 'sztuka', 90),
      I('Rzodkiewka', '', 3, 'sztuka', 45),
      I('Jogurt naturalny', '', 0.5, 'średnie opakowanie', 90),
      I('Szczypiorek', '', 0.4, 'łyżka', 2),
    ],
  };
  const tortilla = {
    id: 'tortilla',
    name: 'Tortilla z tuńczykiem, serem i kukurydzą',
    cat: 'sniadanie',
    sub: 'slone',
    servings: 1,
    kcal: 708,
    items: [
      I('Tortilla pełnoziarnista', 'Snack Day', 2, 'sztuka', 122),
      I('Tuńczyk kawałki w sosie własnym', 'Marinero', 0.8, 'opakowanie', 100),
      I('Kukurydza konserwowa słodka', '', 60, 'g', 60),
      I('Cebula czerwona', '', 0.4, 'sztuka', 40),
      I('Ogórek kiszony', '', 1.2, 'średnia sztuka', 80),
      I('Jogurt grecki 10%', '', 2.5, 'łyżka', 50),
      I('Sok z cytryny', '', 0.7, 'łyżeczka', 2),
      I('Pieprz czarny', '', 1, 'szczypta', 1),
      I('Sól', '', 1, 'szczypta', 1),
      I('Ser Gouda', '', 30, 'g', 30),
    ],
  };
  const catalog = {
    'tortilla pełnoziarnista': { packUnit: 'szt', packG: 61 },
    'tuńczyk kawałki w sosie własnym': { packUnit: 'puszka', packG: 125 },
    'jogurt naturalny': { packUnit: 'opak.', packG: 180 },
    'ziemniaki': { packUnit: 'szt', packG: 74 },
    'ogórek': { packUnit: 'szt', packG: 180 },
    'rzodkiewka': { packUnit: 'szt', packG: 15 },
    'cebula': { packUnit: 'szt', packG: 125 },
    'cebula czerwona': { packUnit: 'szt', packG: 100 },
    'ogórek kiszony': { packUnit: 'szt', packG: 67 },
  };
  for (const n of ['woda', 'sól', 'pieprz czarny', 'olej rzepakowy', 'czosnek w proszku', 'sos sojowy',
    'mąka pszenna', 'skrobia ziemniaczana', 'bulion wołowy', 'bułka tarta']) {
    catalog[n] = { ...(catalog[n] || {}), staple: true };
  }
  const m = defaultMonday();
  return {
    v: 1,
    recipes: [klopsiki, tortilla],
    meals: {
      [iso(m)]: { o: { recipeId: 'klopsiki', servings: 1 } },
      [iso(addDays(m, 1))]: { o: { recipeId: 'tortilla', servings: 1 } },
    },
    list: { items: [], sig: '' },
    catalog,
    barcodes: {},
  };
}

/* ------------------------------------------------------------------ state */

function normalizeState(s) {
  let meals = s.meals && typeof s.meals === 'object' ? s.meals : null;
  if (!meals) {
    // Wersja 1.0 miała plan bez dni: rozkładam dania na obiady od poniedziałku.
    meals = {};
    const m = defaultMonday();
    (Array.isArray(s.plan) ? s.plan : []).slice(0, 7).forEach((p, i) => {
      meals[iso(addDays(m, i))] = { o: { recipeId: p.recipeId, servings: p.servings || 1 } };
    });
  }
  // Wersja 1.2: kategorie przepisów. Dwa przepisy startowe dostają kategorię same.
  const recipes = s.recipes.map((r) => {
    if (r.cat !== undefined) return r;
    if (r.id === 'klopsiki') return { ...r, cat: 'obiad' };
    if (r.id === 'tortilla') return { ...r, cat: 'sniadanie', sub: 'slone' };
    return { ...r, cat: '' };
  });
  const stores = Array.isArray(s.stores) && s.stores.length
    ? s.stores
    : [{ id: 'lidl', name: 'Lidl', order: LIDL_ORDER.slice() }];
  return {
    v: 1,
    recipes,
    meals,
    list: s.list && Array.isArray(s.list.items) ? s.list : { items: [], sig: '' },
    catalog: s.catalog || {},
    barcodes: s.barcodes || {},
    stores,
    activeStore: stores.some((x) => x.id === s.activeStore) ? s.activeStore : stores[0].id,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.recipes)) return normalizeState(s);
    }
  } catch (e) { /* uszkodzone dane — start od zera */ }
  return normalizeState(seed());
}
let state = load();
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Nie udało się zapisać danych na telefonie');
  }
}

const getRecipe = (id) => state.recipes.find((r) => r.id === id);
const activeStore = () => state.stores.find((x) => x.id === state.activeStore) || state.stores[0];
function deptOrder(store = activeStore()) {
  const order = store.order.filter((d) => DEPTS.includes(d));
  for (const d of DEPTS) if (!order.includes(d)) order.splice(Math.max(0, order.indexOf('Inne')) || order.length, 0, d);
  return order;
}
const kindLabel = (r) => (r.cat === 'obiad' ? 'Obiad'
  : r.cat === 'sniadanie' ? (r.sub === 'slodkie' ? 'Słodkie śniadanie' : r.sub === 'slone' ? 'Słone śniadanie' : 'Śniadanie')
    : 'Bez kategorii');
// Posiłki z danego tygodnia: [{ date, slot, recipe, servings }]
function weekMeals(monday) {
  const out = [];
  for (const d of weekDates(monday)) {
    const entry = state.meals[iso(d)] || {};
    for (const slot of SLOTS) {
      const m = entry[slot.key];
      const r = m && getRecipe(m.recipeId);
      if (r) out.push({ date: d, slot: slot.key, recipe: r, servings: m.servings || 1 });
    }
  }
  return out;
}
const cat = (k) => state.catalog[k] || {};
const catFor = (name) => cat(key(name));
const deptOf = (name) => catFor(name).dept || guessDept(name);
function setCat(k, patch) {
  const next = { ...cat(k), ...patch };
  for (const f of Object.keys(next)) if (next[f] === undefined || next[f] === null || next[f] === '' || next[f] === false) delete next[f];
  if (Object.keys(next).length) state.catalog[k] = next;
  else delete state.catalog[k];
}

function weekSig(monday) {
  return hash(JSON.stringify(weekMeals(monday).map((m) =>
    [iso(m.date), m.slot, m.recipe.id, m.servings, m.recipe.servings, m.recipe.items.map((i) => [i.name, i.qty, i.unit, i.g])])));
}

/* -------------------------------------------------------- list generation */

function generateList(monday) {
  const agg = new Map();
  for (const meal of weekMeals(monday)) {
    const r = meal.recipe;
    const f = meal.servings / (r.servings || 1);
    for (const ing of r.items) {
      const k = key(ing.name);
      if (!k) continue;
      let e = agg.get(k);
      if (!e) {
        e = { key: k, name: ing.name.trim(), brand: ing.brand || '', g: 0, other: {}, sources: [] };
        agg.set(k, e);
      }
      if (!e.brand && ing.brand) e.brand = ing.brand;
      if (ing.g != null) e.g += ing.g * f;
      else if (ing.qty != null) {
        const u = (ing.unit || 'szt').trim();
        e.other[u] = (e.other[u] || 0) + ing.qty * f;
      }
      const s = shortName(r);
      if (!e.sources.includes(s)) e.sources.push(s);
    }
  }
  const prevChecked = new Map(state.list.items.filter((i) => !i.manual).map((i) => [i.key, i.checked]));
  const fromRecipes = [...agg.values()].map((e) => ({
    id: `r:${e.key}`,
    key: e.key,
    name: e.name,
    brand: e.brand,
    g: Math.round(e.g * 10) / 10,
    other: e.other,
    sources: e.sources.join(', '),
    checked: prevChecked.get(e.key) || false,
  }));
  const manual = state.list.items.filter((i) => i.manual);
  state.list = { items: [...fromRecipes, ...manual], sig: weekSig(monday), week: iso(monday), at: Date.now() };
  save();
}

function qtyText(item) {
  if (item.manual) return { main: item.qtyText || '', sub: '' };
  const c = cat(item.key);
  const parts = [];
  let sub = '';
  if (item.g > 0) {
    if (c.packG > 0) {
      const n = Math.max(1, Math.ceil(item.g / c.packG - 0.1));
      parts.push(`${n} ${unitFor(n, c.packUnit || 'opak.')}`);
      sub = fmtG(item.g);
    } else parts.push(fmtG(item.g));
  }
  for (const [u, q] of Object.entries(item.other || {})) parts.push(`${fmtNum(q)} ${u}`);
  return { main: parts.join(' + '), sub };
}
const itemDept = (i) => (i.manual ? i.dept || guessDept(i.name) : deptOf(i.name));
const itemImage = (i) => (i.manual ? i.image : catFor(i.name).product?.image) || '';
const isStapleItem = (i) => !i.manual && !!cat(i.key).staple;

/* ---------------------------------------------------------------- screens */

function tabbar(active) {
  const tab = (id, label, ic) =>
    `<a class="tab" href="#/${id}"${active === id ? ' aria-current="page"' : ''}>${icon(ic, 24)}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Nawigacja">${tab('plan', 'Plan', 'plan')}${tab('przepisy', 'Przepisy', 'book')}${tab('lista', 'Lista', 'basket')}</nav>`;
}

let picker = null; // { date: 'YYYY-MM-DD', slot: 's' | 'o' }
let pickerQuery = '';
let pickerSub = 'all';

const SUB_FILTERS = [['all', 'Wszystkie'], ['slodkie', 'Słodkie'], ['slone', 'Słone']];
const byName = (a, b) => a.name.localeCompare(b.name, 'pl');

function pickerOptions() {
  if (!picker) return '';
  if (!state.recipes.length) return '<p class="hint">Nie masz jeszcze przepisów. <a href="#/przepisy">Dodaj pierwszy</a>.</p>';
  const cur = (state.meals[picker.date] || {})[picker.slot];
  const q = key(pickerQuery);
  const wantCat = picker.slot === 's' ? 'sniadanie' : 'obiad';
  const searched = state.recipes.filter((r) => !q || key(r.name).includes(q));
  const main = searched
    .filter((r) => r.cat === wantCat && (wantCat !== 'sniadanie' || pickerSub === 'all' || r.sub === pickerSub))
    .sort(byName);
  const rest = searched.filter((r) => !main.includes(r)).sort(byName);
  const btn = (r) => {
    const sel = !!cur && cur.recipeId === r.id;
    return `<button type="button" class="opt${sel ? ' on' : ''}" data-act="picker-choose" data-rid="${esc(r.id)}" aria-pressed="${sel}">${esc(r.name)}</button>`;
  };
  const what = wantCat === 'obiad' ? 'obiadów' : pickerSub === 'slodkie' ? 'słodkich śniadań' : pickerSub === 'slone' ? 'słonych śniadań' : 'śniadań';
  let html = main.length
    ? `<div class="opt-grid">${main.map(btn).join('')}</div>`
    : `<p class="hint">${q ? 'Nic nie pasuje do wyszukiwania.' : `Nie masz jeszcze ${what}. Kategorię ustawisz w edycji przepisu.`}</p>`;
  if (rest.length) {
    html += `<details class="more"${main.length ? '' : ' open'}><summary>Pozostałe przepisy (${rest.length})</summary><div class="opt-grid">${rest.map(btn).join('')}</div></details>`;
  }
  return html;
}
function renderPicker(dateKey, dayIdx) {
  const slot = SLOTS.find((s) => s.key === picker.slot);
  const cur = (state.meals[dateKey] || {})[picker.slot];
  const title = `Co na ${slot.acc} ${dayIdx === 1 ? 'we' : 'w'} ${DAY_ACC[dayIdx]}?`;
  return `<div class="picker" id="picker" role="group" aria-label="${esc(title)}">
    <p class="picker-title">${esc(title)}</p>
    <div class="seg">${SLOTS.map((s) => `<button type="button" data-act="picker-slot" data-slot="${s.key}" aria-pressed="${s.key === picker.slot}">${s.label}</button>`).join('')}</div>
    ${picker.slot === 's' ? `<div class="chips" role="group" aria-label="Rodzaj śniadania">${SUB_FILTERS.map(([v, l]) => `<button type="button" class="chip" data-act="picker-sub" data-sub="${v}" aria-pressed="${pickerSub === v}">${l}</button>`).join('')}</div>` : ''}
    ${state.recipes.length > 6 ? `<label class="field"><span class="sr-only">Szukaj przepisu</span>${icon('search')}<input id="picker-search" type="search" placeholder="Szukaj przepisu" value="${esc(pickerQuery)}" autocomplete="off"></label>` : ''}
    <div class="picker-opts" id="picker-options">${pickerOptions()}</div>
    <div class="btn-row">
      ${cur ? '<button type="button" class="btn sm danger" data-act="picker-clear">Usuń z planu</button>' : ''}
      <button type="button" class="btn sm" data-act="picker-close">Zamknij</button>
    </div>
  </div>`;
}
function renderPlan() {
  const monday = viewMonday();
  const dates = weekDates(monday);
  const todayKey = iso(new Date());
  let meals = 0;
  let total = 0;
  const chips = [];
  const days = dates.map((d, i) => {
    const dk = iso(d);
    const entry = state.meals[dk] || {};
    const has = {};
    const rows = SLOTS.map((slot) => {
      const m = entry[slot.key];
      const r = m && getRecipe(m.recipeId);
      const active = picker && picker.date === dk && picker.slot === slot.key;
      if (r) {
        has[slot.key] = true;
        meals += 1;
        total += m.servings;
        const last = m.servings <= 1;
        return `<div class="slot${active ? ' active' : ''}">
          <button type="button" class="slot-main" data-act="slot-open" data-date="${dk}" data-slot="${slot.key}" aria-label="Zmień ${slot.acc} na ${DAY_ACC[i]}: ${esc(r.name)}">
            <span class="slot-label">${slot.label}</span>
            <span class="slot-name">${esc(r.name)}</span>
          </button>
          <div class="stepper">
            <button type="button" class="icon-btn" data-act="meal-dec" data-date="${dk}" data-slot="${slot.key}" aria-label="${last ? 'Usuń' : 'Mniej porcji'}: ${slot.acc}, ${DAY_ACC[i]}">${icon(last ? 'x' : 'minus')}</button>
            <span class="count">${esc(fmtNum(m.servings))}</span>
            <button type="button" class="icon-btn" data-act="meal-inc" data-date="${dk}" data-slot="${slot.key}" aria-label="Więcej porcji: ${slot.acc}, ${DAY_ACC[i]}">${icon('plus')}</button>
          </div>
        </div>`;
      }
      return `<button type="button" class="slot slot-empty${active ? ' active' : ''}" data-act="slot-open" data-date="${dk}" data-slot="${slot.key}" aria-label="Wybierz ${slot.acc} na ${DAY_ACC[i]} ${dateShort(d)}">
        <span class="slot-label">${slot.label}</span>
        <span class="slot-add">${icon('plus', 18, 2.2)}<span>Wybierz danie</span></span>
      </button>`;
    }).join('');
    const isToday = dk === todayKey;
    chips.push(`<button type="button" class="day-chip${has.s || has.o ? ' has' : ''}${isToday ? ' today' : ''}" data-act="scroll-day" data-i="${i}" aria-label="${DAY_NAMES[i]} ${dateShort(d)}: śniadanie ${has.s ? 'jest' : 'brak'}, obiad ${has.o ? 'jest' : 'brak'}">
      <span class="dc-short">${DAY_SHORT[i]}</span>
      <span class="dc-num">${d.getDate()}</span>
      <span class="dc-dots"><span class="dot${has.s ? ' on' : ''}"></span><span class="dot${has.o ? ' on' : ''}"></span></span>
    </button>`);
    return `<section class="day" id="dzien-${i}">
      <h2 class="day-title"><span>${DAY_NAMES[i]}</span><span class="day-date">${dateShort(d)}</span>${isToday ? '<span class="today-tag">dziś</span>' : ''}</h2>
      <div class="slots">${rows}</div>
      ${picker && picker.date === dk ? renderPicker(dk, i) : ''}
    </section>`;
  });
  const free = 14 - meals;
  return `
    <main class="screen${meals ? ' has-cta' : ''}">
      <header class="head">
        <div class="head-row">
          <p class="eyebrow">Tydzień ${esc(weekRange(monday))}</p>
          <div class="stepper">
            <button type="button" class="icon-btn surface" data-act="week-prev" aria-label="Poprzedni tydzień">${icon('back')}</button>
            <button type="button" class="icon-btn surface" data-act="week-next" aria-label="Następny tydzień">${icon('chev')}</button>
          </div>
        </div>
        <h1>Plan posiłków</h1>
        <p class="sub">${meals} ${plural(meals, 'posiłek', 'posiłki', 'posiłków')} · ${esc(porcje(total))}${free ? ` · ${free} ${plural(free, 'wolne miejsce', 'wolne miejsca', 'wolnych miejsc')}` : ''}</p>
      </header>
      <nav class="day-strip" aria-label="Dni tygodnia">${chips.join('')}</nav>
      ${days.join('')}
      ${meals ? '<button type="button" class="link-btn" data-act="clear-week">Wyczyść ten tydzień</button>' : ''}
    </main>
    ${meals ? `<div class="cta-bar"><button type="button" class="cta" data-act="generate"><span>Generuj listę zakupów</span>${icon('arrow', 22)}</button></div>` : ''}`;
}

const recipeMeta = (r) => `${porcje(r.servings || 1)} · ${skladniki(r.items.length)}${r.kcal ? ` · ${r.kcal} kcal` : ''}`;
let recipeQuery = '';
let recipeTab = 'sniadanie'; // 'sniadanie' | 'obiad' | 'inne'
let recipeSub = 'all';
const inTab = (r, tab, sub) => (tab === 'inne' ? !r.cat
  : r.cat === tab && (tab !== 'sniadanie' || sub === 'all' || r.sub === sub));
function recipeCards() {
  const q = key(recipeQuery);
  const rs = state.recipes
    .filter((r) => inTab(r, recipeTab, recipeSub) && (!q || key(r.name).includes(q)))
    .sort(byName);
  if (!rs.length) {
    const what = recipeTab === 'obiad' ? 'obiadów' : recipeTab === 'inne' ? 'przepisów bez kategorii'
      : recipeSub === 'slodkie' ? 'słodkich śniadań' : recipeSub === 'slone' ? 'słonych śniadań' : 'śniadań';
    return `<div class="empty">${q ? 'Nic nie pasuje do wyszukiwania.' : `Nie masz jeszcze ${what}.`}</div>`;
  }
  const counts = {};
  for (const m of weekMeals(viewMonday())) counts[m.recipe.id] = (counts[m.recipe.id] || 0) + 1;
  return `<ul class="card-list">${rs.map((r) => {
    const sub = r.cat === 'sniadanie' && r.sub ? `${r.sub === 'slodkie' ? 'Słodkie' : 'Słone'} · ` : '';
    return `<li class="card">
      <a class="card-main" href="#/przepis/${encodeURIComponent(r.id)}">
        <span class="card-title">${esc(r.name)}</span>
        <span class="card-meta">${esc(sub + recipeMeta(r))}${counts[r.id] ? ` · <strong class="in-plan">${counts[r.id]}× w planie</strong>` : ''}</span>
      </a>
      <span class="chev-muted">${icon('chev', 20)}</span>
    </li>`;
  }).join('')}</ul>`;
}
function renderRecipes() {
  const n = (tab, sub = 'all') => state.recipes.filter((r) => inTab(r, tab, sub)).length;
  const uncategorized = n('inne');
  if (recipeTab === 'inne' && !uncategorized) recipeTab = 'sniadanie';
  const tabs = [['sniadanie', 'Śniadania'], ['obiad', 'Obiady']];
  if (uncategorized) tabs.push(['inne', 'Inne']);
  return `
    <main class="screen">
      <header class="head-row">
        <h1>Przepisy</h1>
        <button type="button" class="btn dark sm" data-act="new-recipe">${icon('plus', 18, 2.2)}<span>Nowy</span></button>
      </header>
      <div class="seg" role="group" aria-label="Rodzaj posiłku" style="grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr))">
        ${tabs.map(([v, l]) => `<button type="button" data-act="recipe-tab" data-tab="${v}" aria-pressed="${recipeTab === v}">${l} <span class="seg-count">${n(v)}</span></button>`).join('')}
      </div>
      ${recipeTab === 'sniadanie' ? `<div class="chips" role="group" aria-label="Rodzaj śniadania">${SUB_FILTERS.map(([v, l]) => `<button type="button" class="chip" data-act="recipe-sub" data-sub="${v}" aria-pressed="${recipeSub === v}">${l} <span class="seg-count">${n('sniadanie', v)}</span></button>`).join('')}</div>` : ''}
      <label class="field">
        ${icon('search')}
        <span class="sr-only">Szukaj przepisu</span>
        <input id="recipe-search" type="search" placeholder="Szukaj przepisu" value="${esc(recipeQuery)}" autocomplete="off">
      </label>
      <div id="recipe-list">${recipeCards()}</div>
      <button type="button" class="link-btn" data-act="backup-open">Kopia zapasowa i import przepisów</button>
    </main>`;
}

function ingRow(r, ing) {
  const c = catFor(ing.name);
  const img = c.product?.image;
  const amount = ing.qty != null ? `${fmtNum(ing.qty)} ${ing.unit || ''}`.trim() : '';
  const showG = ing.g != null && !(ing.unit === 'g' && ing.qty === ing.g);
  const dept = c.dept || guessDept(ing.name);
  return `<li><button type="button" class="row${c.staple ? ' muted-bg' : ''}" data-act="edit-ing" data-rid="${esc(r.id)}" data-iid="${esc(ing.id)}">
    ${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
    <span class="row-main">
      <span class="row-title">${esc(ing.name)}${ing.brand ? ` <span class="brand">· ${esc(ing.brand)}</span>` : ''}</span>
      <span class="row-sub">${c.staple ? `${icon('home', 14)}<span>Zawsze w domu</span><span aria-hidden="true">·</span>` : ''}<span>${esc(dept)}</span></span>
    </span>
    <span class="qty">${esc(amount || (ing.g != null ? fmtG(ing.g) : '—'))}${showG && amount ? `<small>${esc(fmtG(ing.g))}</small>` : ''}</span>
  </button></li>`;
}
function renderRecipe(id) {
  const r = getRecipe(id);
  if (!r) {
    return `<main class="screen"><a class="back" href="#/przepisy">${icon('back', 24)}<span>Przepisy</span></a><div class="empty">Nie ma takiego przepisu.</div></main>`;
  }
  return `
    <main class="screen">
      <a class="back" href="#/przepisy">${icon('back', 24)}<span>Przepisy</span></a>
      <label class="sr-only" for="r-name">Nazwa przepisu</label>
      <textarea id="r-name" class="title-input" rows="${r.name.length > 26 ? 2 : 1}" data-change="recipe-name" data-rid="${esc(r.id)}">${esc(r.name)}</textarea>
      <div class="lbl">Kategoria
        <div class="seg seg-kinds" role="group" aria-label="Kategoria przepisu">
          ${RECIPE_KINDS.map((k) => `<button type="button" data-act="recipe-kind" data-rid="${esc(r.id)}" data-cat="${k.cat}" data-sub="${k.sub}" aria-pressed="${r.cat === k.cat && (k.cat !== 'sniadanie' || r.sub === k.sub)}">${k.label}</button>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-main">
          <span class="card-title" style="font-size:16px">Porcje w przepisie</span>
          <span class="card-meta" style="font-size:13px">Na tyle porcji podane są ilości</span>
        </div>
        <div class="stepper">
          <button type="button" class="icon-btn" data-act="serv-dec" data-rid="${esc(r.id)}" aria-label="Mniej porcji">${icon('minus')}</button>
          <span class="count">${esc(fmtNum(r.servings || 1))}</span>
          <button type="button" class="icon-btn" data-act="serv-inc" data-rid="${esc(r.id)}" aria-label="Więcej porcji">${icon('plus')}</button>
        </div>
      </div>
      <label class="lbl">Kalorie na porcję
        <input class="input" id="r-kcal" inputmode="numeric" placeholder="opcjonalnie" value="${r.kcal ?? ''}" data-change="recipe-kcal" data-rid="${esc(r.id)}">
      </label>
      <section class="group">
        <h2 class="section-title">Składniki · ${r.items.length}</h2>
        ${r.items.length ? `<ul class="group-list">${r.items.map((ing) => ingRow(r, ing)).join('')}</ul>` : '<div class="empty">Brak składników. Dodaj pierwszy poniżej albo wklej całą listę.</div>'}
      </section>
      <div class="add-row">
        <label class="field">
          <span class="sr-only">Dodaj składnik</span>
          <input id="ing-quick" placeholder="np. 120 g mięso mielone" autocomplete="off" enterkeyhint="done" data-enter="add-ing" data-rid="${esc(r.id)}">
        </label>
        <button type="button" class="square" data-act="add-ing" data-rid="${esc(r.id)}" aria-label="Dodaj składnik">${icon('plus', 22, 2.2)}</button>
      </div>
      <button type="button" class="btn" data-act="bulk-open" data-rid="${esc(r.id)}">${icon('paste')}<span>Wklej wiele składników naraz</span></button>
      <button type="button" class="link-btn" style="color:var(--danger)" data-act="recipe-delete" data-rid="${esc(r.id)}">Usuń przepis</button>
    </main>`;
}

function listRow(item) {
  const q = qtyText(item);
  const img = itemImage(item);
  const sub = item.manual ? (item.code ? 'Zeskanowane' : 'Dodane ręcznie') : item.sources;
  return `<li><button type="button" class="row${item.checked ? ' done' : ''}" data-act="toggle-item" data-id="${esc(item.id)}" aria-pressed="${item.checked ? 'true' : 'false'}">
    <span class="check" aria-hidden="true">${icon('check', 16, 3)}</span>
    ${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
    <span class="row-main">
      <span class="row-title">${esc(item.name)}${item.brand ? ` <span class="brand">· ${esc(item.brand)}</span>` : ''}</span>
      <span class="row-sub">${esc(sub)}</span>
    </span>
    <span class="qty">${esc(q.main)}${q.sub ? `<small>${esc(q.sub)}</small>` : ''}</span>
  </button></li>`;
}
const sortItems = (a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name, 'pl');
function renderList() {
  const items = state.list.items;
  const hasRecipeItems = items.some((i) => !i.manual);
  const listMonday = state.list.week ? fromIso(state.list.week) : null;
  const planned = weekMeals(viewMonday()).length > 0;
  const stale = hasRecipeItems ? (!listMonday || state.list.sig !== weekSig(listMonday)) : planned;
  const regular = items.filter((i) => !isStapleItem(i));
  const staples = items.filter(isStapleItem).sort(sortItems);
  const groups = deptOrder().map((d) => ({ d, items: regular.filter((i) => itemDept(i) === d).sort(sortItems) })).filter((g) => g.items.length);
  const done = regular.filter((i) => i.checked).length;
  const storeRow = `<div class="store-row">
      <div class="chips" role="group" aria-label="Sklep">${state.stores.map((s) => `<button type="button" class="chip" data-act="store-pick" data-id="${esc(s.id)}" aria-pressed="${s.id === state.activeStore}">${esc(s.name)}</button>`).join('')}</div>
      <button type="button" class="link-btn" data-act="stores-open">Kolejność działów</button>
    </div>`;
  const banner = stale
    ? `<div class="banner"><span>${hasRecipeItems ? 'Plan zmienił się od ostatniego generowania.' : `Masz zaplanowany tydzień ${esc(weekRange(viewMonday()))}.`}</span><button type="button" class="btn primary sm" data-act="generate-here">${hasRecipeItems ? 'Odśwież' : 'Generuj'}</button></div>`
    : '';
  const body = items.length
    ? `${groups.map((g) => `
        <section class="group">
          <h2 class="group-title"><span>${esc(g.d)}</span><span>${g.items.length}</span></h2>
          <ul class="group-list">${g.items.map(listRow).join('')}</ul>
        </section>`).join('')}
      ${staples.length ? `
        <details class="group staples">
          <summary><h2 class="group-title"><span>Sprawdź w domu</span><span>${staples.length}</span></h2><span class="chev">${icon('chev', 18)}</span></summary>
          <p class="hint" style="margin-bottom:8px">Produkty oznaczone jako „zawsze w domu”. Odhacz, jeśli trzeba dokupić.</p>
          <ul class="group-list">${staples.map(listRow).join('')}</ul>
        </details>` : ''}
      <div class="actions-row">
        <button type="button" class="btn sm" data-act="clear-checked">Usuń kupione</button>
        <button type="button" class="btn sm danger" data-act="clear-list">Wyczyść listę</button>
      </div>`
    : `<div class="empty">Lista jest pusta.<br>Zaplanuj dania i wygeneruj listę albo dodaj coś ręcznie.</div>`;
  return `
    <main class="screen">
      <header class="head">
        <div class="head-row">
          <h1>Lista zakupów</h1>
          ${items.length ? `<button type="button" class="icon-btn" data-act="share-list" aria-label="Udostępnij listę">${icon('share')}</button>` : ''}
        </div>
        <p class="sub">${regular.length} ${plural(regular.length, 'produkt', 'produkty', 'produktów')} · ${done} w koszyku${hasRecipeItems && listMonday ? ` · tydzień ${esc(weekRange(listMonday))}` : ''}</p>
        ${storeRow}
      </header>
      ${banner}
      <div class="add-row">
        <label class="field">
          <span class="sr-only">Dodaj coś spoza przepisów</span>
          <input id="manual-add" placeholder="Dodaj coś jeszcze" autocomplete="off" enterkeyhint="done" data-enter="add-manual">
        </label>
        <button type="button" class="square" data-act="add-manual" aria-label="Dodaj do listy">${icon('plus', 22, 2.2)}</button>
        <button type="button" class="square dark" data-act="scan-to-list" aria-label="Skanuj kod kreskowy">${icon('scan', 22, 2.2)}</button>
      </div>
      ${body}
    </main>`;
}

/* ----------------------------------------------------------------- router */

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: name || 'plan', id: id ? decodeURIComponent(id) : null };
}
let lastRoute = '';
function render() {
  const r = route();
  let html;
  if (r.name === 'przepisy') html = renderRecipes();
  else if (r.name === 'przepis') html = renderRecipe(r.id);
  else if (r.name === 'lista') html = renderList();
  else if (r.name === 'sklep') html = renderStores();
  else html = renderPlan();
  const tab = r.name === 'przepis' ? 'przepisy' : r.name === 'sklep' ? 'lista' : r.name;
  $('#app').innerHTML = html + tabbar(tab);
  const sig = `${r.name}/${r.id || ''}`;
  if (sig !== lastRoute) window.scrollTo(0, 0);
  lastRoute = sig;
}
window.addEventListener('hashchange', render);

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Cofnij</button>' : ''}`;
  document.body.appendChild(el);
  if (undo) el.querySelector('button').addEventListener('click', () => { undo(); el.remove(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4500);
}

/* ------------------------------------------------------------------ sheet */

function openSheet(html, onMount) {
  stopScanner();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop" data-act="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(root.querySelector('.sheet'));
}
function closeSheet() {
  stopScanner();
  $('#sheet-root').innerHTML = '';
  document.body.style.overflow = '';
}
const sheetHead = (title) =>
  `<div class="head-row"><h2>${esc(title)}</h2><button type="button" class="icon-btn plain" data-act="sheet-close" aria-label="Zamknij">${icon('x')}</button></div>`;

/* -------------------------------------------------------------- ingredient */

function productBlock(p) {
  if (!p) return '';
  const meta = [p.brand, p.quantity, p.code].filter(Boolean).map(esc).join(' · ');
  return `<div class="prod">
    ${p.image ? `<img class="thumb lg" src="${esc(p.image)}" alt="">` : ''}
    <div class="row-main"><span class="row-title">${esc(p.name || 'Produkt bez nazwy')}</span><span class="row-sub">${meta}</span></div>
    <button type="button" class="icon-btn plain" data-act="ing-unlink" aria-label="Odłącz produkt">${icon('x')}</button>
  </div>`;
}
let ingCtx = null;
function openIngredient(rid, iid) {
  const r = getRecipe(rid);
  const ing = r && r.items.find((i) => i.id === iid);
  if (!ing) return;
  ingCtx = { rid, iid };
  const c = catFor(ing.name);
  const dept = c.dept || guessDept(ing.name);
  openSheet(`
    ${sheetHead('Składnik')}
    <label class="lbl">Nazwa<input class="input" id="i-name" value="${esc(ing.name)}" autocomplete="off"></label>
    <label class="lbl">Marka (opcjonalnie)<input class="input" id="i-brand" value="${esc(ing.brand || '')}" autocomplete="off"></label>
    <div class="grid3">
      <label class="lbl">Ilość<input class="input" id="i-qty" inputmode="decimal" value="${ing.qty != null ? esc(fmtNum(ing.qty)) : ''}"></label>
      <label class="lbl">Jednostka<input class="input" id="i-unit" list="unit-list" value="${esc(ing.unit || '')}" autocomplete="off"></label>
      <label class="lbl">Gramy<input class="input" id="i-g" inputmode="decimal" value="${ing.g != null ? esc(fmtNum(ing.g)) : ''}"></label>
    </div>
    <datalist id="unit-list">${UNIT_SUGGESTIONS.map((u) => `<option value="${esc(u)}"></option>`).join('')}</datalist>
    <p class="hint">Najważniejsze są gramy: po nich apka sumuje ten produkt z różnych przepisów.</p>
    <h3 class="section-title" style="font-size:18px;margin-top:6px">W sklepie</h3>
    <label class="lbl">Dział<select class="input" id="i-dept">${DEPTS.map((d) => `<option${d === dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="lbl">Kupujesz na<input class="input" id="i-pu" placeholder="np. puszka, szt" value="${esc(c.packUnit || '')}" autocomplete="off"></label>
      <label class="lbl">Ile to gramów<input class="input" id="i-pg" inputmode="decimal" placeholder="np. 125" value="${c.packG != null ? esc(fmtNum(c.packG)) : ''}"></label>
    </div>
    <label class="switch-row"><span><strong>Zawsze w domu</strong><br><span class="hint">Trafi tylko do zwiniętej sekcji „Sprawdź w domu”</span></span><input type="checkbox" id="i-staple" class="toggle"${c.staple ? ' checked' : ''}></label>
    ${productBlock(c.product)}
    <button type="button" class="btn" data-act="ing-scan">${icon('scan')}<span>${c.product ? 'Zeskanuj inny produkt' : 'Przypisz produkt skanerem'}</span></button>
    <p class="hint">Ustawienia „W sklepie” i przypisany produkt dotyczą tego składnika we wszystkich przepisach.</p>
    <div class="btn-row">
      <button type="button" class="btn danger" data-act="ing-delete">Usuń</button>
      <button type="button" class="btn primary" data-act="ing-save">Zapisz</button>
    </div>`);
}
function applyIngredientForm() {
  if (!ingCtx) return null;
  const r = getRecipe(ingCtx.rid);
  const ing = r && r.items.find((i) => i.id === ingCtx.iid);
  if (!ing) return null;
  const oldKey = key(ing.name);
  const name = $('#i-name').value.trim() || ing.name;
  const newKey = key(name);
  ing.name = name;
  ing.brand = $('#i-brand').value.trim();
  ing.qty = toNum($('#i-qty').value);
  ing.unit = $('#i-unit').value.trim();
  const g = toNum($('#i-g').value);
  ing.g = g != null ? g : gramsFor(ing.qty, ing.unit, null);
  const dept = $('#i-dept').value;
  const prevCat = cat(oldKey);
  setCat(newKey, {
    dept: dept !== guessDept(name) ? dept : undefined,
    packUnit: $('#i-pu').value.trim() || undefined,
    packG: toNum($('#i-pg').value) || undefined,
    staple: $('#i-staple').checked || undefined,
    product: cat(newKey).product || prevCat.product || undefined,
  });
  save();
  return { r, ing };
}

/* ---------------------------------------------------------------- scanner */

let detectorPromise = null;
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          if (supported.includes('ean_13')) return new window.BarcodeDetector({ formats: formats.filter((f) => supported.includes(f)) });
        } catch (e) { /* użyj zamiennika */ }
      }
      let lastErr;
      for (const url of PONYFILL_URLS) {
        try {
          const mod = await import(url);
          return new mod.BarcodeDetector({ formats });
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('Brak skanera');
    })().catch((e) => { detectorPromise = null; throw e; });
  }
  return detectorPromise;
}

let scan = null;
function stopScanner() {
  if (!scan) return;
  scan.stopped = true;
  if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
  scan = null;
}
function finishScan(code) {
  const handler = scan && scan.onCode;
  stopScanner();
  closeSheet();
  if (handler) handler(String(code).trim());
}
function openScanner(title, onCode) {
  openSheet(`
    ${sheetHead(title)}
    <div class="scan-frame"><video id="scan-video" playsinline muted autoplay></video><div class="scan-guide" aria-hidden="true"></div></div>
    <p class="sub" id="scan-status" role="status">Ładuję skaner…</p>
    <label class="btn" for="scan-photo">${icon('camera')}<span>Zrób zdjęcie kodu</span></label>
    <input id="scan-photo" type="file" accept="image/*" capture="environment" class="sr-only">
    <div class="add-row">
      <label class="field"><span class="sr-only">Numer kodu kreskowego</span><input id="scan-manual" inputmode="numeric" placeholder="albo wpisz numer spod kodu" autocomplete="off" data-enter="scan-manual-ok"></label>
      <button type="button" class="square" data-act="scan-manual-ok" aria-label="Szukaj kodu">${icon('arrow', 22, 2.2)}</button>
    </div>`, () => {
    scan = { onCode, stopped: false, stream: null };
    startCamera(scan);
  });
}
async function startCamera(s) {
  const status = (t) => { const el = $('#scan-status'); if (el && !s.stopped) el.textContent = t; };
  let det;
  try {
    det = await getDetector();
  } catch (e) {
    status('Nie mogę wczytać skanera — za pierwszym razem potrzebny jest internet. Wpisz numer kodu ręcznie.');
    return;
  }
  if (s.stopped) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status('Ta przeglądarka nie daje dostępu do kamery. Zrób zdjęcie kodu albo wpisz numer.');
    return;
  }
  try {
    s.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    status('Brak dostępu do kamery. Zezwól na kamerę albo zrób zdjęcie kodu.');
    return;
  }
  if (s.stopped) { s.stream.getTracks().forEach((t) => t.stop()); return; }
  const video = $('#scan-video');
  video.srcObject = s.stream;
  try { await video.play(); } catch (e) { /* iOS czasem odpala sam */ }
  status('Celuj w kod kreskowy w ramce.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (s.stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const w = video.videoWidth, h = video.videoHeight;
      const cw = Math.round(w * 0.8), ch = Math.round(h * 0.5);
      canvas.width = cw; canvas.height = ch;
      ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
      try {
        const res = await det.detect(canvas);
        if (!s.stopped && res && res.length && res[0].rawValue) { finishScan(res[0].rawValue); return; }
      } catch (e) { /* kolejna klatka */ }
    }
    setTimeout(tick, 160);
  };
  tick();
}
async function scanFromPhoto(file) {
  const status = (t) => { const el = $('#scan-status'); if (el) el.textContent = t; };
  status('Szukam kodu na zdjęciu…');
  try {
    const det = await getDetector();
    let source;
    try {
      source = await createImageBitmap(file);
    } catch (e) {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }
    const res = await det.detect(source);
    if (res && res.length && res[0].rawValue) finishScan(res[0].rawValue);
    else status('Nie widzę kodu na zdjęciu. Podejdź bliżej, bez odblasków, albo wpisz numer.');
  } catch (e) {
    status('Nie udało się odczytać zdjęcia. Wpisz numer kodu ręcznie.');
  }
}

async function lookup(code) {
  if (state.barcodes[code]) return { code, ...state.barcodes[code], found: true };
  try {
    const res = await fetch(offUrl(code));
    if (res.ok) {
      const j = await res.json();
      const p = j && j.status === 1 ? j.product : null;
      if (p) {
        const name = (p.product_name_pl || p.product_name || '').trim();
        return {
          code,
          name,
          brand: String(p.brands || '').split(',')[0].trim(),
          quantity: (p.quantity || '').trim(),
          image: p.image_front_small_url || p.image_small_url || p.image_front_url || '',
          found: !!name,
        };
      }
    }
    return { code, found: false };
  } catch (e) {
    return { code, found: false, offline: true };
  }
}

let pendingProduct = null;
async function scanToList() {
  openScanner('Skanuj do listy', async (code) => {
    openSheet(`${sheetHead('Szukam produktu…')}<p class="sub">Kod <code>${esc(code)}</code></p>`);
    const p = await lookup(code);
    pendingProduct = p;
    const name = p.name || '';
    const dept = name ? guessDept(name) : 'Inne';
    const note = p.found
      ? (state.barcodes[code] ? 'Znam ten produkt z wcześniejszego skanu.' : 'Dane i zdjęcie: Open Food Facts.')
      : p.offline
        ? 'Brak internetu, nie sprawdzę kodu. Wpisz nazwę, a zapamiętam kod.'
        : 'Nie znam tego kodu. Wpisz nazwę, a zapamiętam go na przyszłość.';
    openSheet(`
      ${sheetHead('Dodaj do listy')}
      ${p.found ? productBlock({ ...p }).replace(/<button[\s\S]*?<\/button>/, '') : `<p class="sub">Kod <code>${esc(code)}</code></p>`}
      <p class="hint">${esc(note)}</p>
      <label class="lbl">Nazwa<input class="input" id="p-name" value="${esc(name)}" autocomplete="off"></label>
      <div class="grid2">
        <label class="lbl">Ile<input class="input" id="p-qty" value="1 szt" autocomplete="off"></label>
        <label class="lbl">Dział<select class="input" id="p-dept">${DEPTS.map((d) => `<option${d === dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-act="sheet-close">Anuluj</button>
        <button type="button" class="btn primary" data-act="scan-add-confirm">Dodaj do listy</button>
      </div>`, (el) => { if (!name) $('#p-name', el).focus(); });
  });
}
function scanToIngredient() {
  const res = applyIngredientForm();
  if (!res) return;
  const { r, ing } = res;
  openScanner('Przypisz produkt', async (code) => {
    openSheet(`${sheetHead('Szukam produktu…')}<p class="sub">Kod <code>${esc(code)}</code></p>`);
    const p = await lookup(code);
    const k = key(ing.name);
    const product = { code, name: p.name || ing.name, brand: p.brand || '', quantity: p.quantity || '', image: p.image || '' };
    const patch = { product };
    const qg = parseQuantityG(p.quantity);
    if (qg && !cat(k).packG) { patch.packG = qg; if (!cat(k).packUnit) patch.packUnit = 'opak.'; }
    setCat(k, patch);
    if (p.found) state.barcodes[code] = { name: product.name, brand: product.brand, quantity: product.quantity, image: product.image };
    if (!ing.brand && product.brand) ing.brand = product.brand;
    save();
    openIngredient(r.id, ing.id);
    toast(p.found ? 'Przypisano produkt' : (p.offline ? 'Brak internetu — zapisałem sam kod' : 'Nie znalazłem kodu w Open Food Facts — zapisałem sam kod'));
  });
}

/* ---------------------------------------------------------- backup/import */

function normalizeRecipe(x) {
  if (!x || typeof x !== 'object' || !x.name) return null;
  const items = (Array.isArray(x.items) ? x.items : Array.isArray(x.ingredients) ? x.ingredients : [])
    .filter((i) => i && i.name)
    .map((i) => {
      const qty = toNum(i.qty ?? i.amount);
      const unit = String(i.unit || '').trim();
      const g = toNum(i.g ?? i.grams);
      return { id: uid(), name: String(i.name).trim(), brand: String(i.brand || '').trim(), qty, unit, g: g != null ? g : gramsFor(qty, unit, null) };
    });
  const cat = normCat(x.cat ?? x.type ?? x.kategoria);
  const sub = cat === 'sniadanie' ? normSub(x.sub ?? x.subtype ?? x.rodzaj) : '';
  return { id: uid(), name: String(x.name).trim(), cat, sub, servings: toNum(x.servings) || 1, kcal: toNum(x.kcal), items };
}
function openBackup() {
  openSheet(`
    ${sheetHead('Kopia i import')}
    <p class="sub">Wszystko jest zapisane tylko na tym telefonie. Raz na jakiś czas zrób kopię.</p>
    <div class="btn-row">
      <button type="button" class="btn" data-act="export">${icon('save')}<span>Zapisz kopię</span></button>
      <label class="btn" for="import-file">${icon('paste')}<span>Wczytaj kopię</span></label>
    </div>
    <input id="import-file" type="file" accept="application/json,.json" class="sr-only">
    <h3 class="section-title" style="font-size:18px;margin-top:8px">Dodaj przepisy z JSON</h3>
    <p class="hint">Wyślij Claude'owi zrzuty przepisów i poproś o JSON w tym formacie, potem wklej go tutaj:<br><code>[{"name":"…","cat":"sniadanie","sub":"slone","servings":1,"kcal":604,"items":[{"name":"Cebula","qty":0.2,"unit":"średnia sztuka","g":25}]}]</code><br>„cat” to sniadanie albo obiad, „sub” (tylko śniadania) to slodkie albo slone.</p>
    <label class="sr-only" for="json-in">JSON z przepisami</label>
    <textarea id="json-in" class="input" placeholder="[ { &quot;name&quot;: … } ]"></textarea>
    <button type="button" class="btn primary" data-act="json-import">Dodaj przepisy</button>
    <p class="hint">Dane i zdjęcia produktów ze skanera: Open Food Facts (licencje ODbL i CC BY-SA). Wersja apki: ${APP_VERSION}.</p>`);
}
async function exportBackup() {
  const data = JSON.stringify(state, null, 2);
  const name = `zakupy-kopia-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kopia: Zakupy' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------------------------------------------------------- actions */

function shareText() {
  const items = state.list.items.filter((i) => !isStapleItem(i) && !i.checked);
  const lines = [`Lista zakupów (${activeStore().name})`];
  for (const d of deptOrder()) {
    const g = items.filter((i) => itemDept(i) === d).sort(sortItems);
    if (!g.length) continue;
    lines.push('', `${d}:`);
    for (const i of g) {
      const q = qtyText(i).main;
      lines.push(`- ${i.name}${i.brand ? ` (${i.brand})` : ''}${q ? ` — ${q}` : ''}`);
    }
  }
  return lines.join('\n');
}

function setMeal(dateKey, slotKey, value) {
  const entry = { ...(state.meals[dateKey] || {}) };
  if (value) entry[slotKey] = value;
  else delete entry[slotKey];
  if (Object.keys(entry).length) state.meals[dateKey] = entry;
  else delete state.meals[dateKey];
}
const snapshotMeals = () => JSON.parse(JSON.stringify(state.meals));

/* --------------------------------------------------------- kolejność sklepu */

let lastMoved = '';
function renderStores() {
  const store = activeStore();
  const order = deptOrder(store);
  return `
    <main class="screen">
      <a class="back" href="#/lista">${icon('back', 24)}<span>Lista</span></a>
      <header class="head">
        <h1>Kolejność w sklepie</h1>
        <p class="sub">Lista zakupów układa działy w tej kolejności. Ustaw ją tak, jak idziesz przez sklep od wejścia do kas.</p>
      </header>
      <div class="chips" role="group" aria-label="Sklep">
        ${state.stores.map((s) => `<button type="button" class="chip" data-act="store-pick" data-id="${esc(s.id)}" aria-pressed="${s.id === store.id}">${esc(s.name)}</button>`).join('')}
        <button type="button" class="chip add" data-act="store-add">${icon('plus', 16, 2.2)}<span>Dodaj sklep</span></button>
      </div>
      <label class="lbl">Nazwa sklepu<input class="input" id="store-name" value="${esc(store.name)}" autocomplete="off" enterkeyhint="done" placeholder="np. Lidl Głogowska"></label>
      <ol class="order-list">
        ${order.map((d, i) => `<li class="order-row${d === lastMoved ? ' moved' : ''}">
          <span class="order-num">${i + 1}</span>
          <span class="order-name">${esc(d)}</span>
          <button type="button" class="icon-btn" data-act="dept-up" data-i="${i}" aria-label="Wyżej: ${esc(d)}"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
          <button type="button" class="icon-btn" data-act="dept-down" data-i="${i}" aria-label="Niżej: ${esc(d)}"${i === order.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
        </li>`).join('')}
      </ol>
      <div class="btn-row">
        <button type="button" class="btn sm" data-act="store-reset">Typowy układ Lidla</button>
        ${state.stores.length > 1 ? '<button type="button" class="btn sm danger" data-act="store-delete">Usuń ten sklep</button>' : ''}
      </div>
      <a class="btn primary" href="#/lista">Gotowe</a>
    </main>`;
}
function moveDept(i, delta) {
  const store = activeStore();
  const order = deptOrder(store);
  const j = i + delta;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  store.order = order;
  lastMoved = order[j];
  save(); render();
}

const actions = {
  'sheet-close': closeSheet,
  'sheet-backdrop': (el, ev) => { if (ev.target === el) closeSheet(); },

  'recipe-tab': (el) => { recipeTab = el.dataset.tab; recipeSub = 'all'; render(); },
  'recipe-sub': (el) => { recipeSub = el.dataset.sub; render(); },
  'recipe-kind': (el) => {
    const r = getRecipe(el.dataset.rid);
    if (!r) return;
    r.cat = el.dataset.cat;
    r.sub = el.dataset.sub || '';
    save(); render();
  },
  'picker-sub': (el) => { pickerSub = el.dataset.sub; render(); },

  'stores-open': () => { lastMoved = ''; location.hash = '#/sklep'; },
  'store-pick': (el) => {
    state.activeStore = el.dataset.id;
    lastMoved = '';
    save(); render();
  },
  'store-add': () => {
    const s = { id: uid(), name: `Sklep ${state.stores.length + 1}`, order: deptOrder() };
    state.stores.push(s);
    state.activeStore = s.id;
    lastMoved = '';
    save(); render();
    const input = $('#store-name');
    if (input) { input.focus(); input.select(); }
  },
  'store-delete': (el) => {
    if (el.dataset.armed !== '1') {
      el.dataset.armed = '1';
      el.textContent = 'Na pewno? Kliknij jeszcze raz';
      return;
    }
    if (state.stores.length < 2) return;
    state.stores = state.stores.filter((s) => s.id !== state.activeStore);
    state.activeStore = state.stores[0].id;
    save(); render();
  },
  'store-reset': () => { activeStore().order = LIDL_ORDER.slice(); lastMoved = ''; save(); render(); },
  'dept-up': (el) => moveDept(Number(el.dataset.i), -1),
  'dept-down': (el) => moveDept(Number(el.dataset.i), 1),

  'week-prev': () => { weekOffset -= 1; picker = null; render(); },
  'week-next': () => { weekOffset += 1; picker = null; render(); },
  'scroll-day': (el) => {
    const sec = document.getElementById(`dzien-${el.dataset.i}`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'slot-open': (el) => {
    const same = picker && picker.date === el.dataset.date && picker.slot === el.dataset.slot;
    picker = same ? null : { date: el.dataset.date, slot: el.dataset.slot };
    pickerQuery = '';
    pickerSub = 'all';
    render();
    const p = $('#picker');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  'picker-slot': (el) => { if (picker) { picker.slot = el.dataset.slot; pickerSub = 'all'; render(); } },
  'picker-choose': (el) => {
    if (!picker) return;
    const r = getRecipe(el.dataset.rid);
    if (!r) return;
    const cur = (state.meals[picker.date] || {})[picker.slot];
    setMeal(picker.date, picker.slot, { recipeId: r.id, servings: cur ? cur.servings : Math.max(1, Math.round(r.servings || 1)) });
    picker = null;
    save(); render();
  },
  'picker-clear': () => {
    if (!picker) return;
    const before = snapshotMeals();
    setMeal(picker.date, picker.slot, null);
    picker = null;
    save(); render();
    toast('Usunięto z planu', () => { state.meals = before; save(); render(); });
  },
  'picker-close': () => { picker = null; render(); },
  'meal-inc': (el) => {
    const m = (state.meals[el.dataset.date] || {})[el.dataset.slot];
    if (m) { m.servings = Math.min(50, (m.servings || 1) + 1); save(); render(); }
  },
  'meal-dec': (el) => {
    const m = (state.meals[el.dataset.date] || {})[el.dataset.slot];
    if (!m) return;
    if (m.servings > 1) { m.servings -= 1; save(); render(); return; }
    const before = snapshotMeals();
    setMeal(el.dataset.date, el.dataset.slot, null);
    if (picker && picker.date === el.dataset.date && picker.slot === el.dataset.slot) picker = null;
    save(); render();
    toast('Usunięto z planu', () => { state.meals = before; save(); render(); });
  },
  'clear-week': () => {
    const before = snapshotMeals();
    for (const d of weekDates(viewMonday())) delete state.meals[iso(d)];
    picker = null;
    save(); render();
    toast('Tydzień wyczyszczony', () => { state.meals = before; save(); render(); });
  },
  generate: () => { picker = null; generateList(viewMonday()); location.hash = '#/lista'; },
  'generate-here': () => {
    const hasRecipeItems = state.list.items.some((i) => !i.manual);
    const monday = hasRecipeItems && state.list.week ? fromIso(state.list.week) : viewMonday();
    generateList(monday);
    render();
    toast('Lista odświeżona');
  },

  'new-recipe': () => {
    const cat = recipeTab === 'inne' ? '' : recipeTab;
    const sub = cat === 'sniadanie' && recipeSub !== 'all' ? recipeSub : '';
    const r = { id: uid(), name: 'Nowy przepis', cat, sub, servings: 1, kcal: null, items: [] };
    state.recipes.push(r);
    save();
    location.hash = `#/przepis/${encodeURIComponent(r.id)}`;
    setTimeout(() => { const t = $('#r-name'); if (t) { t.focus(); t.select(); } }, 50);
  },
  'serv-inc': (el) => { const r = getRecipe(el.dataset.rid); if (r) { r.servings = (r.servings || 1) + 1; save(); render(); } },
  'serv-dec': (el) => { const r = getRecipe(el.dataset.rid); if (r && r.servings > 1) { r.servings -= 1; save(); render(); } },
  'recipe-delete': (el) => {
    if (el.dataset.armed !== '1') {
      el.dataset.armed = '1';
      el.textContent = 'Na pewno? Kliknij jeszcze raz';
      setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = 'Usuń przepis'; } }, 3500);
      return;
    }
    const rid = el.dataset.rid;
    const r = getRecipe(rid);
    const idx = state.recipes.indexOf(r);
    const mealsBefore = snapshotMeals();
    state.recipes = state.recipes.filter((x) => x.id !== rid);
    for (const [dk, entry] of Object.entries(state.meals)) {
      for (const slot of SLOTS) if (entry[slot.key] && entry[slot.key].recipeId === rid) setMeal(dk, slot.key, null);
    }
    save();
    location.hash = '#/przepisy';
    toast('Usunięto przepis', () => { state.recipes.splice(idx, 0, r); state.meals = mealsBefore; save(); render(); });
  },
  'add-ing': (el) => {
    const r = getRecipe(el.dataset.rid);
    const input = $('#ing-quick');
    if (!r || !input || !input.value.trim()) return;
    const it = parseLine(input.value);
    if (it) { r.items.push(it); save(); render(); }
    const again = $('#ing-quick');
    if (again) again.focus();
  },
  'bulk-open': (el) => {
    const rid = el.dataset.rid;
    openSheet(`
      ${sheetHead('Wklej składniki')}
      <p class="sub">Jeden składnik w linii. Rozumiem np.:<br><code>120 g mięso mielone</code><br><code>Ogórek kiszony 1.2 średnia sztuka / 80g</code></p>
      <label class="sr-only" for="bulk-in">Składniki</label>
      <textarea id="bulk-in" class="input" rows="9"></textarea>
      <div class="btn-row">
        <button type="button" class="btn" data-act="sheet-close">Anuluj</button>
        <button type="button" class="btn primary" data-act="bulk-save" data-rid="${esc(rid)}">Dodaj składniki</button>
      </div>`, (s) => $('#bulk-in', s).focus());
  },
  'bulk-save': (el) => {
    const r = getRecipe(el.dataset.rid);
    const items = parseLines($('#bulk-in').value || '');
    if (!r || !items.length) { toast('Nic nie rozpoznałem'); return; }
    r.items.push(...items);
    save(); closeSheet(); render();
    toast(`Dodano ${skladniki(items.length)}`);
  },
  'edit-ing': (el) => openIngredient(el.dataset.rid, el.dataset.iid),
  'ing-save': () => { if (applyIngredientForm()) { closeSheet(); render(); } },
  'ing-delete': () => {
    const r = ingCtx && getRecipe(ingCtx.rid);
    if (!r) return;
    const idx = r.items.findIndex((i) => i.id === ingCtx.iid);
    if (idx < 0) return;
    const [removed] = r.items.splice(idx, 1);
    save(); closeSheet(); render();
    toast(`Usunięto: ${removed.name}`, () => { r.items.splice(idx, 0, removed); save(); render(); });
  },
  'ing-scan': scanToIngredient,
  'ing-unlink': () => {
    const res = applyIngredientForm();
    if (!res) return;
    setCat(key(res.ing.name), { product: undefined });
    save();
    openIngredient(res.r.id, res.ing.id);
  },

  'toggle-item': (el) => {
    const it = state.list.items.find((i) => i.id === el.dataset.id);
    if (!it) return;
    it.checked = !it.checked;
    save(); render();
  },
  'add-manual': () => {
    const input = $('#manual-add');
    const text = input && input.value.trim();
    if (!text) return;
    const parsed = parseLine(text);
    const qtyTxt = parsed.qty != null ? `${fmtNum(parsed.qty)} ${parsed.unit || 'szt'}`.trim() : '';
    state.list.items.push({ id: uid(), key: key(parsed.name), name: parsed.name, brand: '', qtyText: qtyTxt, manual: true, checked: false });
    save(); render();
    const again = $('#manual-add');
    if (again) again.focus();
  },
  'scan-to-list': scanToList,
  'scan-manual-ok': () => {
    const v = ($('#scan-manual').value || '').replace(/\s+/g, '');
    if (!/^\d{6,14}$/.test(v)) { const st = $('#scan-status'); if (st) st.textContent = 'Kod to zwykle 8 albo 13 cyfr.'; return; }
    finishScan(v);
  },
  'scan-add-confirm': () => {
    const p = pendingProduct;
    if (!p) return;
    const name = $('#p-name').value.trim();
    if (!name) { $('#p-name').focus(); return; }
    const entry = { name, brand: p.brand || '', quantity: p.quantity || '', image: p.image || '' };
    state.barcodes[p.code] = entry;
    state.list.items.push({
      id: uid(), key: key(name), name, brand: entry.brand, qtyText: $('#p-qty').value.trim(),
      manual: true, checked: false, image: entry.image, dept: $('#p-dept').value, code: p.code,
    });
    pendingProduct = null;
    save(); closeSheet(); render();
    toast(`Dodano: ${name}`);
  },
  'clear-checked': () => {
    const before = state.list.items.slice();
    state.list.items = state.list.items.filter((i) => !i.checked);
    save(); render();
    toast('Usunięto kupione', () => { state.list.items = before; save(); render(); });
  },
  'clear-list': () => {
    const before = state.list;
    state.list = { items: [], sig: '' };
    save(); render();
    toast('Lista wyczyszczona', () => { state.list = before; save(); render(); });
  },
  'share-list': async () => {
    const text = shareText();
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('Skopiowano listę'); } catch (e) { toast('Nie udało się udostępnić'); }
  },

  'backup-open': openBackup,
  export: exportBackup,
  'json-import': () => {
    let data;
    try { data = JSON.parse($('#json-in').value); } catch (e) { toast('To nie jest poprawny JSON'); return; }
    const arr = Array.isArray(data) ? data : Array.isArray(data.recipes) ? data.recipes : [data];
    const recipes = arr.map(normalizeRecipe).filter(Boolean);
    if (!recipes.length) { toast('Nie znalazłem przepisów w tym JSON'); return; }
    state.recipes.push(...recipes);
    save(); closeSheet(); render();
    toast(`Dodano ${recipes.length} ${plural(recipes.length, 'przepis', 'przepisy', 'przepisów')}`);
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, ev);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const t = ev.target;
  if (t.matches && t.matches('[data-enter]')) {
    ev.preventDefault();
    const fn = actions[t.dataset.enter];
    if (fn) fn(t, ev);
  } else if (t.id === 'r-name' || t.id === 'store-name') {
    ev.preventDefault();
    t.blur();
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'scan-photo' && t.files && t.files[0]) { scanFromPhoto(t.files[0]); return; }
  if (t.id === 'import-file' && t.files && t.files[0]) {
    t.files[0].text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.recipes)) throw new Error('bad');
      const before = state;
      state = normalizeState(data);
      picker = null;
      save(); closeSheet(); render();
      toast('Wczytano kopię', () => { state = before; save(); render(); });
    }).catch(() => toast('Ten plik nie wygląda na kopię z tej apki'));
    return;
  }
  if (t.id === 'store-name') {
    // Bez pełnego odświeżenia: tap w strzałkę zaraz po wpisaniu nazwy nie może przepaść.
    activeStore().name = t.value.trim() || 'Sklep';
    save();
    const chip = document.querySelector(`.chip[data-act="store-pick"][data-id="${CSS.escape(state.activeStore)}"]`);
    if (chip) chip.textContent = activeStore().name;
    return;
  }
  const r = t.dataset && t.dataset.rid ? getRecipe(t.dataset.rid) : null;
  if (t.dataset.change === 'recipe-name' && r) { r.name = t.value.replace(/\s+/g, ' ').trim() || 'Bez nazwy'; save(); }
  if (t.dataset.change === 'recipe-kcal' && r) { r.kcal = toNum(t.value); save(); }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'recipe-search') {
    recipeQuery = ev.target.value;
    const box = $('#recipe-list');
    if (box) box.innerHTML = recipeCards();
  }
  if (ev.target.id === 'picker-search') {
    pickerQuery = ev.target.value;
    const box = $('#picker-options');
    if (box) box.innerHTML = pickerOptions();
  }
});

/* ------------------------------------------------------------------- boot */

render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
