import { normalize } from "./textMatching";

const MIN_LENGTH = 3;

/**
 * Cheap checks that run before any interpretation: they reject empty or nonsense
 * text without spending an API call. Returns the rejection reason, or null when the
 * text can be interpreted.
 */
export function basicRejection(description: string): string | null {
  const text = normalize(description).trim();

  if (text.length < MIN_LENGTH) {
    return "La descripción es demasiado corta. Cuenta qué nivel quieres, por ejemplo: «un laberinto de hielo con trampas».";
  }

  const words = text.match(/[a-zñ]+/g) ?? [];
  if (words.length === 0) {
    return "La descripción debe tener palabras, no solo números o símbolos.";
  }

  // Keyboard mashing like "asdfgh" or "aaaaaaa": no 3+ letter word has vowels, or letters repeat endlessly.
  const longWords = words.filter((w) => w.length >= 3);
  const noVowels = longWords.length > 0 && longWords.every((w) => !/[aeiouy]/.test(w));
  if (noVowels || /([a-z])\1{4,}/.test(text)) {
    return "El texto no parece tener sentido. Describe el nivel con palabras, por ejemplo: «mazmorra con enemigos y jefe final».";
  }

  return null;
}

export const NOT_A_LEVEL_REASON =
  "Esto no parece la descripción de un nivel de juego. Menciona un tipo (plataformas, laberinto o mazmorra), un ambiente (hielo, lava, bosque, espacio...) o elementos (trampas, enemigos, jefe final).";
