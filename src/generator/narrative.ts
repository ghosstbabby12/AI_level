import { createRng } from "./rng";
import { LevelSpec, Narrative, Theme } from "./types";

/**
 * Narrativa de respaldo cuando no hay IA: plantillas por tema, elegidas con la
 * semilla para que el mismo nivel tenga siempre el mismo titulo.
 */
const TITLES: Record<Theme, string[]> = {
  ice: ["Cavernas de Escarcha", "El Glaciar Silencioso", "Fortaleza Helada"],
  lava: ["Corazón del Volcán", "Ríos de Magma", "La Forja Ardiente"],
  forest: ["Bosque Susurrante", "Raíces Antiguas", "El Claro Perdido"],
  desert: ["Dunas Infinitas", "Tumba del Faraón", "El Oasis Olvidado"],
  dungeon: ["Catacumbas Olvidadas", "La Mazmorra Sin Nombre", "Celdas de Piedra"],
  overworld: ["Colinas del Amanecer", "Camino de las Nubes", "Praderas Lejanas"],
  water: ["Abismo Coralino", "Ruinas Sumergidas", "Corrientes Profundas"],
  space: ["Estación Órbita 7", "Nebulosa Errante", "Más Allá de las Estrellas"],
};

const SETTINGS: Record<Theme, string> = {
  ice: "El hielo cruje bajo tus pies y el frío no perdona.",
  lava: "El aire arde y el suelo tiembla con cada paso.",
  forest: "Entre los árboles algo te observa en silencio.",
  desert: "El sol abrasa y la arena esconde secretos antiguos.",
  dungeon: "Las antorchas apenas iluminan estos muros de piedra.",
  overworld: "El viento sopla sobre las colinas y el camino es largo.",
  water: "La luz se apaga a medida que desciendes.",
  space: "Las alarmas de la estación no dejan de sonar.",
};

const GOALS = {
  platformer: "Avanza, salta y llega a la meta.",
  maze: "Encuentra la salida antes de perderte.",
  dungeon: "Recorre las salas y escapa con vida.",
};

const BOSS_LINES = [
  "Nadie ha salido de aquí con vida.",
  "Has llegado lejos… pero aquí termina tu viaje.",
  "Este lugar es mío. Vete o caerás.",
  "Llevo siglos esperando a alguien como tú.",
];

export function templateNarrative(spec: LevelSpec): Narrative {
  const rng = createRng(spec.seed ^ 0x5eed);
  return {
    title: rng.pick(TITLES[spec.theme]),
    story: `${SETTINGS[spec.theme]} ${GOALS[spec.layout]}`,
    bossLine: spec.boss ? rng.pick(BOSS_LINES) : null,
  };
}
