/** Lowercase and without accents, so "Dragón" and "dragon" match the same stem. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A "=word" stem requires the whole word; any other stem is a prefix (covers plurals and conjugations). */
export function pattern(stems: string[]): string {
  const alternatives = stems.map((raw) => {
    const stem = normalize(raw);
    return stem.startsWith("=") ? `${escapeRegex(stem.slice(1))}\\b` : `${escapeRegex(stem)}\\w*`;
  });
  return `\\b(?:${alternatives.join("|")})`;
}

export function countMatches(text: string, stems: string[]): number {
  return (text.match(new RegExp(pattern(stems), "g")) || []).length;
}

export function has(text: string, stems: string[]): boolean {
  return countMatches(text, stems) > 0;
}
