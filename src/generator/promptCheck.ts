import { normalize } from "./keywordParser";

const MIN_LENGTH = 3;

/**
 * Controles baratos que corren antes de cualquier interpretacion: rechazan
 * textos vacios o sin sentido sin gastar una llamada a la API.
 * Devuelve el motivo del rechazo, o null si el texto puede interpretarse.
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

  // Teclazos tipo "asdfgh" o "aaaaaaa": ninguna palabra de 3+ letras tiene vocales, o hay letras repetidas sin fin.
  const longWords = words.filter((w) => w.length >= 3);
  const noVowels = longWords.length > 0 && longWords.every((w) => !/[aeiouy]/.test(w));
  if (noVowels || /([a-z])\1{4,}/.test(text)) {
    return "El texto no parece tener sentido. Describe el nivel con palabras, por ejemplo: «mazmorra con enemigos y jefe final».";
  }

  return null;
}

export const NOT_A_LEVEL_REASON =
  "Esto no parece la descripción de un nivel de juego. Menciona un tipo (plataformas, laberinto o mazmorra), un ambiente (hielo, lava, bosque, espacio...) o elementos (trampas, enemigos, jefe final).";
