"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDescription = parseDescription;
function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Un stem "=palabra" exige palabra completa; cualquier otro es un prefijo (cubre plurales y conjugaciones). */
function pattern(stems) {
    const alternatives = stems.map((raw) => {
        const stem = normalize(raw);
        return stem.startsWith("=") ? `${escapeRegex(stem.slice(1))}\\b` : `${escapeRegex(stem)}\\w*`;
    });
    return `\\b(?:${alternatives.join("|")})`;
}
function countMatches(text, stems) {
    return (text.match(new RegExp(pattern(stems), "g")) || []).length;
}
function has(text, stems) {
    return countMatches(text, stems) > 0;
}
const THEME_STEMS = {
    ice: ["hiel", "helad", "niev", "glaci", "=ice", "iceberg", "frozen", "freez", "nevad", "polar", "artic"],
    lava: ["lava", "fuego", "volcan", "fire", "magma", "infiern", "ardient"],
    forest: ["bosque", "selva", "jungla", "forest", "jungle", "arbol", "=tree", "=trees"],
    desert: ["desiert", "duna", "desert", "=sand", "oasis", "piramide", "pyramid"],
    dungeon: ["mazmorr", "dungeon", "castill", "castle", "cript", "catacumb", "piedra", "stone", "calabozo", "templo"],
    overworld: ["cielo", "nube", "cloud", "overworld", "pradera", "grass", "hierba"],
    water: ["=mar", "=agua", "=sea", "submarin", "ocean", "underwater", "acuatic", "=water", "coral"],
    space: ["espacio", "=space", "galax", "estelar", "=nave", "=naves", "planeta", "planet", "cosmic", "asteroid", "neon"],
};
const PLATFORMER_STEMS = ["mario", "plataform", "platform", "sidescroll", "side scroll", "scroller", "lateral", "sonic", "saltar", "salto", "jump", "runner"];
const MAZE_STEMS = ["laberint", "maze"];
const DUNGEON_LAYOUT_STEMS = ["mazmorr", "dungeon", "habitacion", "=room", "=rooms", "=sala", "=salas", "zelda", "rogue", "calabozo", "cripta", "catacumb"];
const TRAP_STEMS = ["trampa", "trap", "pincho", "spike", "peligro", "hazard"];
const ENEMY_STEMS = ["enemig", "enemy", "enemies", "monstruo", "monster", "guardia", "goomba", "koopa", "criatura", "esqueleto", "zombie", "slime", "bicho"];
const ITEM_STEMS = ["llave", "=key", "=keys", "tesoro", "treasure", "moneda", "=coin", "=coins", "gema", "=gem", "=gems", "=item", "=items", "objeto", "estrella", "=star", "=stars"];
const BOSS_STEMS = ["boss", "jefe", "bowser", "dragon", "guardian"];
const HARD_STEMS = ["dificil", "=hard", "extrem", "brutal", "imposible", "letal", "infernal"];
const EASY_STEMS = ["facil", "=easy", "sencill", "relajad", "tranquil", "principiante", "beginner"];
const SMALL_STEMS = ["peque", "=small", "=mini", "=corto", "=corta", "=short", "=tiny"];
const LARGE_STEMS = ["grande", "enorm", "=large", "=big", "gigant", "extens", "=largo", "=larga", "=long"];
const NUMBER_WORDS = {
    un: 1, uno: 1, una: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4,
    cinco: 5, five: 5, seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8,
    nueve: 9, nine: 9, diez: 10, ten: 10,
};
function readQuantity(text, stems) {
    const stem = pattern(stems);
    const mentioned = new RegExp(stem).test(text);
    const negated = new RegExp(`\\b(?:sin|no|without)\\s+(?:\\w+\\s+)?${stem.slice(2)}`).test(text);
    let count;
    const countMatch = text.match(new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:\\w+\\s+)?${stem.slice(2)}`));
    if (countMatch) {
        const raw = countMatch[1];
        const value = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMBER_WORDS[raw];
        if (value > 0)
            count = value;
    }
    let multiplier = mentioned ? 1.4 : 1;
    if (new RegExp(`\\b(?:muchos|muchas|mucho|many|lots|varios|varias|numerosos|numerosas)\\s+(?:de\\s+|of\\s+)?(?:\\w+\\s+)?${stem.slice(2)}`).test(text)) {
        multiplier = 1.9;
    }
    else if (new RegExp(`\\b(?:pocos|pocas|few|poco)\\s+(?:\\w+\\s+)?${stem.slice(2)}`).test(text)) {
        multiplier = 0.5;
    }
    return { mentioned, negated, count, multiplier };
}
function toFeature(quantity, defaultEnabled) {
    const enabled = quantity.negated ? false : quantity.mentioned || defaultEnabled;
    return { enabled, count: enabled ? quantity.count : undefined, multiplier: quantity.multiplier };
}
function detectTheme(text, layout) {
    let best = null;
    let bestScore = 0;
    for (const theme of Object.keys(THEME_STEMS)) {
        const score = countMatches(text, THEME_STEMS[theme]);
        if (score > bestScore) {
            best = theme;
            bestScore = score;
        }
    }
    if (best)
        return best;
    return layout === "platformer" ? "overworld" : "dungeon";
}
function detectLayout(text) {
    if (has(text, PLATFORMER_STEMS))
        return "platformer";
    if (has(text, MAZE_STEMS))
        return "maze";
    if (has(text, DUNGEON_LAYOUT_STEMS))
        return "dungeon";
    return null;
}
const SIZES = {
    maze: { small: [15, 15], normal: [25, 25], large: [39, 39] },
    dungeon: { small: [31, 21], normal: [41, 27], large: [55, 35] },
    platformer: { small: [70, 14], normal: [120, 16], large: [200, 18] },
};
const LIMITS = {
    maze: { w: [11, 51], h: [11, 51] },
    dungeon: { w: [25, 61], h: [17, 41] },
    platformer: { w: [40, 300], h: [12, 20] },
};
function clamp(value, [min, max]) {
    return Math.min(max, Math.max(min, value));
}
function detectSize(text, layout) {
    const explicit = text.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})\b/);
    let width;
    let height;
    if (explicit) {
        width = parseInt(explicit[1], 10);
        height = parseInt(explicit[2], 10);
    }
    else if (has(text, SMALL_STEMS)) {
        [width, height] = SIZES[layout].small;
    }
    else if (has(text, LARGE_STEMS)) {
        [width, height] = SIZES[layout].large;
    }
    else {
        [width, height] = SIZES[layout].normal;
    }
    width = clamp(width, LIMITS[layout].w);
    height = clamp(height, LIMITS[layout].h);
    if (layout === "maze") {
        if (width % 2 === 0)
            width += 1;
        if (height % 2 === 0)
            height += 1;
    }
    return { width, height };
}
/**
 * Traduce una descripcion en lenguaje natural (espanol/ingles) a una
 * especificacion concreta. Es un interprete basado en reglas: reconoce tipo de
 * nivel, tema, dificultad, tamano, jefe final, cantidades ("5 trampas"),
 * intensidad ("muchos enemigos") y negaciones ("sin trampas").
 */
function parseDescription(description, seed) {
    const text = normalize(description || "");
    const layout = detectLayout(text) ?? "maze";
    const theme = detectTheme(text, layout);
    const resolvedLayout = detectLayout(text) ?? (theme === "dungeon" ? "dungeon" : "maze");
    const difficulty = has(text, HARD_STEMS) ? "hard" : has(text, EASY_STEMS) ? "easy" : "normal";
    const { width, height } = detectSize(text, resolvedLayout);
    const boss = readQuantity(text, BOSS_STEMS);
    const items = readQuantity(text, ITEM_STEMS);
    return {
        description,
        seed: seed ?? Math.floor(Math.random() * 2 ** 31),
        theme,
        layout: resolvedLayout,
        difficulty,
        width,
        height,
        boss: boss.mentioned && !boss.negated,
        traps: toFeature(readQuantity(text, TRAP_STEMS), true),
        enemies: toFeature(readQuantity(text, ENEMY_STEMS), true),
        items: toFeature(items, resolvedLayout === "platformer"),
    };
}
