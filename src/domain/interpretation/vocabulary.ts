import { BossKind, EnemyKind, ItemKind, Theme } from "../level/types";

/** Word stems (Spanish and English) the keyword interpreter recognises. See textMatching.pattern. */
export const THEME_STEMS: Record<Theme, string[]> = {
  ice: ["hiel", "helad", "niev", "glaci", "=ice", "iceberg", "frozen", "freez", "nevad", "polar", "artic"],
  lava: ["lava", "fuego", "volcan", "fire", "magma", "infiern", "ardient"],
  forest: ["bosque", "selva", "jungla", "forest", "jungle", "arbol", "=tree", "=trees"],
  desert: ["desiert", "duna", "desert", "=sand", "oasis", "piramide", "pyramid"],
  dungeon: ["mazmorr", "dungeon", "castill", "castle", "cript", "catacumb", "piedra", "stone", "calabozo", "templo"],
  overworld: ["cielo", "nube", "cloud", "overworld", "pradera", "grass", "hierba"],
  water: ["=mar", "=agua", "=sea", "submarin", "ocean", "underwater", "acuatic", "=water", "coral"],
  space: ["espacio", "=space", "galax", "estelar", "=nave", "=naves", "planeta", "planet", "cosmic", "asteroid", "neon"],
};

export const TRAP_STEMS = ["bomba", "=bomb", "=bombs", "trampa", "trap", "pincho", "spike", "peligro", "hazard"];
export const ENEMY_STEMS = ["enemig", "enemy", "enemies", "monstruo", "monster", "guardia", "goomba", "koopa", "criatura", "esqueleto", "zombie", "slime", "bicho"];
export const ITEM_STEMS = ["=diana", "=dianas", "arma", "espada", "hacha", "=arco", "weapon", "sword", "pocion", "potion", "fruta", "fruit", "manzana", "cristal", "llave", "=key", "=keys", "tesoro", "treasure", "moneda", "=coin", "=coins", "gema", "=gem", "=gems", "=item", "=items", "objeto", "estrella", "=star", "=stars"];
export const BOSS_STEMS = ["boss", "jefe", "bowser", "dragon", "guardian"];

export const HARD_STEMS = ["dificil", "=hard", "extrem", "brutal", "imposible", "letal", "infernal"];
export const EASY_STEMS = ["facil", "=easy", "sencill", "relajad", "tranquil", "principiante", "beginner"];
export const SMALL_STEMS = ["peque", "=small", "=mini", "=corto", "=corta", "=short", "=tiny"];
export const LARGE_STEMS = ["grande", "enorm", "=large", "=big", "gigant", "extens", "=largo", "=larga", "=long"];

/** Words that ask for a level even without a type or theme ("un nivel dificil", "mapa con monedas"). */
export const GENERIC_LEVEL_STEMS = ["nivel", "level", "=mapa", "=mapas", "=map", "=maps", "escenario", "=juego", "=game", "=stage", "=fase", "=mundo", "=world", "videojuego"];

/** The first kind mentioned wins; without a mention, the classic one is used. */
export const ITEM_KIND_STEMS: [ItemKind, string[]][] = [
  ["weapon", ["arma", "espada", "hacha", "=arco", "lanza", "weapon", "sword"]],
  ["key", ["llave", "=key", "=keys"]],
  ["gem", ["gema", "=gem", "=gems", "cristal", "diamante", "joya"]],
  ["potion", ["pocion", "potion", "elixir"]],
  ["star", ["estrella", "=star", "=stars"]],
  ["fruit", ["fruta", "fruit", "manzana", "cereza"]],
  ["coin", ["moneda", "=coin", "=coins", "tesoro", "treasure", "oro"]],
];
export const ENEMY_KIND_STEMS: [EnemyKind, string[]][] = [
  ["ghost", ["fantasma", "ghost", "espectro", "espiritu", "embrujad"]],
  ["skeleton", ["esqueleto", "skeleton", "no muerto", "undead", "zombie"]],
  ["robot", ["robot", "droide", "android", "maquina"]],
  ["bat", ["murcielago", "=bat", "=bats"]],
  ["slime", ["slime", "baba", "gelatin", "=limo"]],
  ["mixed", ["random", "aleatori", "variad", "distintos", "diferentes", "mixed"]],
];
export const BOSS_KIND_STEMS: [BossKind, string[]][] = [
  ["dragon", ["dragon"]],
  ["vampire", ["vampir", "dracula", "=conde"]],
  ["mech", ["robot gigante", "=mecha", "=mech", "maquina"]],
];

export const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4,
  cinco: 5, five: 5, seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8,
  nueve: 9, nine: 9, diez: 10, ten: 10,
};

/** Collectibles named with the user's own word ("18 manzanas", not "18 frutas"). */
export const ITEM_NOUNS = ["manzana", "cereza", "fruta", "platano", "fresa", "uva", "naranja", "espada", "hacha", "lanza", "llave", "gema", "cristal",
  "diamante", "joya", "pocion", "elixir", "estrella", "moneda", "tesoro", "huevo", "seta", "hongo", "flor", "caramelo", "dulce", "galleta", "pez", "hueso", "perla", "rubi", "esmeralda", "pluma", "calabaza", "bellota", "zanahoria", "pastel"];
