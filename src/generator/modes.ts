import { Kinds, Layout, Theme } from "./types";

type Size = [number, number];

export interface ModeInfo {
  /** Nombre visible del tipo de juego. */
  label: string;
  /** Como se nombra el estilo al sugerirlo cuando se rechaza un genero. */
  style: string;
  /** Objetivo para la narrativa de respaldo. */
  goal: string;
  /** Instrucciones que ve el jugador. */
  controls: string;
  /** Cuando debe elegirlo la IA. */
  hint: string;
  /** Palabras clave para el interprete sin IA. */
  stems: string[];
  sizes: { small: Size; normal: Size; large: Size };
  limits: { w: Size; h: Size };
  theme: Theme;
  itemsByDefault?: boolean;
  /** El generador necesita dimensiones impares. */
  oddSize?: boolean;
  /** Aspecto por defecto cuando no se pide otro. */
  kinds?: Partial<Kinds>;
}

const MOVE_ATTACK = "Mover: flechas o WASD en cualquier dirección · Atacar: Espacio · Impulso: Shift · Las trampas y los enemigos quitan vida · R reinicia";

/**
 * Registro de modos de juego. Para agregar uno: una entrada aqui, su generador
 * en BUILDERS (levelBuilder.ts) y su archivo en modes/ del frontend. Las
 * instrucciones de la IA, las palabras clave y los controles salen de esta tabla.
 */
export const MODES: Record<Layout, ModeInfo> = {
  invaders: {
    label: "Naves espaciales",
    style: "naves espaciales",
    goal: "Destruye la invasión antes de que llegue hasta ti.",
    controls: "Mover: flechas, A/D o mouse · Disparar: Espacio o clic (mantén pulsado) · Recoge lo que sueltan los enemigos · R reinicia",
    hint: "pilotar una nave abajo y disparar a una formacion de invasores que desciende (Space Invaders, Galaga, matamarcianos, batallas de naves).",
    stems: ["matamarcianos", "invader", "invasor", "invasion", "galaga", "marciano", "batalla espacial", "combate espacial", "=naves"],
    sizes: { small: [20, 13], normal: [24, 15], large: [30, 19] },
    limits: { w: [18, 36], h: [12, 23] },
    theme: "space",
    kinds: { enemy: "robot", boss: "mech", item: "star" },
  },
  racing: {
    label: "Carreras",
    style: "carreras",
    goal: "Da todas las vueltas y cruza la meta en primer lugar.",
    controls: "Acelerar: ↑ o W · Frenar: ↓ o S · Girar: ← → o A/D · Las franjas naranjas dan turbo · Las manchas oscuras te hacen patinar · R reinicia",
    hint: "carreras de autos en un circuito cerrado visto desde arriba, contra rivales y por vueltas (carreras, kart, circuito, rally).",
    stems: ["carrera", "racing", "=race", "=races", "=auto", "=autos", "=coche", "=coches", "=pista", "circuito", "kart", "=rally", "formula 1"],
    sizes: { small: [56, 38], normal: [72, 46], large: [96, 60] },
    limits: { w: [48, 120], h: [32, 76] },
    theme: "overworld",
  },
  breakout: {
    label: "Rompe-bloques",
    style: "rompe-bloques",
    goal: "Rompe todos los bloques sin dejar caer la pelota.",
    controls: "Mover: mouse o flechas · Lanzar la pelota: clic o Espacio · Los bloques naranjas explotan · Los dorados dan mejoras · R reinicia",
    hint: "rebotar una pelota con una paleta para romper bloques (Breakout, Arkanoid, rompe ladrillos).",
    stems: ["breakout", "arkanoid", "rompe bloques", "rompebloques", "rompe-bloques", "romper bloques", "rompe ladrillos", "ladrillos", "=bloques"],
    sizes: { small: [20, 13], normal: [24, 15], large: [30, 19] },
    limits: { w: [18, 36], h: [12, 23] },
    theme: "space",
  },
  snake: {
    label: "Serpiente",
    style: "serpiente",
    goal: "Come todo lo que aparezca sin chocar contigo.",
    controls: "Girar: flechas o WASD · Cada bocado te hace más largo · No choques con las paredes, las trampas ni contigo · R reinicia",
    hint: "guiar una serpiente que crece al comer sin chocar (Snake, viborita, culebra).",
    stems: ["snake", "serpiente", "culebra", "vibora", "viborita"],
    sizes: { small: [20, 13], normal: [28, 18], large: [36, 23] },
    limits: { w: [16, 48], h: [11, 30] },
    theme: "forest",
    itemsByDefault: true,
    kinds: { item: "fruit" },
  },
  survival: {
    label: "Supervivencia por oleadas",
    style: "supervivencia por oleadas",
    goal: "Resiste todas las oleadas de enemigos.",
    controls: "Mover: flechas o WASD en cualquier dirección · Atacar: Espacio · Impulso: Shift · Los objetos curan · Sobrevive a todas las oleadas · R reinicia",
    hint: "arena cerrada donde llegan oleadas de enemigos cada vez mas numerosas y hay que resistir (supervivencia, hordas, zombies, vampire survivors, ultimo en pie).",
    stems: ["supervivencia", "sobrevivir", "sobrevive", "oleada", "survival", "survive", "horda", "=waves", "ultimo en pie"],
    sizes: { small: [27, 19], normal: [33, 23], large: [45, 29] },
    limits: { w: [21, 61], h: [15, 41] },
    theme: "dungeon",
    itemsByDefault: true,
    kinds: { enemy: "skeleton", item: "potion" },
  },
  shooter: {
    label: "Tiro al blanco",
    style: "tiro al blanco",
    goal: "Apunta bien, acierta las dianas y no toques las bombas.",
    controls: "Apuntar: mouse o flechas · Disparar: clic o Espacio · En las dianas, cuanto más al centro, más puntos · No dispares a las bombas · R reinicia",
    hint: "galeria de tiro donde se apunta y dispara a dianas, sin mover un personaje (tiro al blanco, punteria, disparar, arqueria, francotirador).",
    stems: ["tiro al blanco", "galeria de tiro", "=diana", "=dianas", "punteria", "shooter", "disparar", "=disparos", "=disparo", "=tiro", "=tiros", "francotirador", "sniper", "=target", "=targets", "arqueria"],
    sizes: { small: [20, 13], normal: [24, 15], large: [30, 19] },
    limits: { w: [16, 36], h: [11, 23] },
    theme: "overworld",
    itemsByDefault: true,
  },
  arcade: {
    label: "Arcade de persecucion",
    style: "arcade",
    goal: "Recógelo todo sin dejarte atrapar.",
    controls: "Mover: flechas o WASD (sigues avanzando solo) · Recógelo todo · Las esferas rosas te permiten atrapar a quienes te persiguen · Los bordes abiertos te llevan al otro lado · R reinicia",
    hint: "tablero simetrico visible completo, recoger todos los puntos mientras te persiguen y usar potenciadores (Pac-Man, comecocos, arcade, retro, persecucion, \"recoger todo\"). No tiene trampas ni salida; usa items enabled=true y prefiere enemy_kind \"ghost\".",
    stems: ["pacman", "pac man", "pac-man", "=arcade", "comecocos", "come cocos", "persecucion", "=retro"],
    sizes: { small: [21, 17], normal: [25, 19], large: [33, 23] },
    limits: { w: [17, 41], h: [13, 27] },
    theme: "space",
    itemsByDefault: true,
    oddSize: true,
    kinds: { enemy: "ghost" },
  },
  platformer: {
    label: "Plataformas de scroll lateral",
    style: "plataformas",
    goal: "Avanza, salta y llega a la meta.",
    controls: "Mover: flechas o A/D · Saltar: ↑ / W / Espacio (mantén para saltar más alto) · Pisa a los enemigos y al jefe desde arriba · R reinicia",
    hint: "plataformas de scroll lateral (Mario, Sonic, saltar).",
    stems: ["mario", "plataform", "platform", "sidescroll", "side scroll", "scroller", "lateral", "sonic", "saltar", "salto", "jump", "runner"],
    sizes: { small: [70, 14], normal: [120, 16], large: [200, 18] },
    limits: { w: [40, 300], h: [12, 20] },
    theme: "overworld",
    itemsByDefault: true,
  },
  cave: {
    label: "Cuevas organicas",
    style: "cuevas",
    goal: "Abre camino por las cuevas hasta la salida.",
    controls: MOVE_ATTACK,
    hint: "exploracion libre y fluida por cuevas de forma organica, minas o paisajes naturales sin salas rectas.",
    stems: ["cueva", "caverna", "=cave", "=caves", "cavern", "gruta", "=mina", "=minas", "=mine", "=mines", "subterrane", "underground", "fluid", "movimiento libre"],
    sizes: { small: [35, 23], normal: [51, 33], large: [71, 45] },
    limits: { w: [25, 91], h: [17, 61] },
    theme: "dungeon",
  },
  maze: {
    label: "Laberinto",
    style: "laberintos",
    goal: "Encuentra la salida antes de perderte.",
    controls: MOVE_ATTACK,
    hint: "laberintos de pasillos.",
    stems: ["laberint", "maze"],
    sizes: { small: [15, 15], normal: [25, 25], large: [39, 39] },
    limits: { w: [11, 51], h: [11, 51] },
    theme: "dungeon",
    oddSize: true,
  },
  dungeon: {
    label: "Mazmorra con salas y pasillos",
    style: "mazmorras",
    goal: "Recorre las salas y escapa con vida.",
    controls: MOVE_ATTACK,
    hint: "mazmorras con salas (Zelda, roguelike).",
    stems: ["mazmorr", "dungeon", "habitacion", "=room", "=rooms", "=sala", "=salas", "zelda", "rogue", "calabozo", "cripta", "catacumb"],
    sizes: { small: [31, 21], normal: [41, 27], large: [55, 35] },
    limits: { w: [25, 61], h: [17, 41] },
    theme: "dungeon",
  },
};

/** Orden de deteccion por palabras clave: los mas especificos primero. */
export const MODE_PRIORITY = Object.keys(MODES) as Layout[];
