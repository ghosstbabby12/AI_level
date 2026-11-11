import vm from "node:vm";

/** Compiles each inline <script> with vm.Script: it only parses the syntax, nothing runs. */
function scriptProblems(html: string): string[] {
  const problems: string[] = [];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length === 0) problems.push("El documento no tiene ningún <script> con el código del juego.");
  scripts.forEach(([, attrs, code], index) => {
    const name = `script ${index + 1}`;
    if (/\bsrc\s*=/i.test(attrs)) {
      problems.push(`El ${name} carga un archivo externo (src=...), que el iframe bloquea: el código debe ir en línea.`);
      return;
    }
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1].toLowerCase();
    if (type && !/^(text|application)\/(javascript|ecmascript)$/.test(type)) return; // data or templates, not code
    try {
      new vm.Script(code, { filename: `${name}.js` });
    } catch (error) {
      // The first line of V8's stack has "<file>:<line>".
      const line = String((error as Error).stack ?? "").match(new RegExp(`${name}\\.js:(\\d+)`))?.[1];
      problems.push(`Error de sintaxis en el ${name}${line ? `, línea ${line}` : ""}: ${(error as Error).message}`);
    }
  });
  return problems;
}

/**
 * Problems that would stop the game from starting, found without running it:
 * - Syntax errors in the inline scripts.
 * - Browser storage: in the sandboxed iframe (no allow-same-origin) touching localStorage,
 *   sessionStorage, indexedDB or document.cookie throws and the game stays black.
 * - External resources: the iframe security policy blocks them.
 * Returns an empty list when nothing is found. Messages are fed back to the model in Spanish.
 */
export function findGameProblems(html: string): string[] {
  const problems: string[] = [];
  if (!/<\/html>\s*$/i.test(html)) problems.push("El documento está incompleto: no termina en </html>.");
  problems.push(...scriptProblems(html));

  const storage = html.match(/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/);
  if (storage) problems.push(`Usa ${storage[1]}, que no existe en el iframe aislado y detiene el juego al arrancar.`);
  if (/\bfetch\s*\(|XMLHttpRequest|<link[^>]+href\s*=\s*["']?https?:|<img[^>]+src\s*=\s*["']?https?:/i.test(html)) {
    problems.push("Pide recursos por red (fetch, imágenes o estilos externos), que el iframe bloquea.");
  }
  return problems;
}
