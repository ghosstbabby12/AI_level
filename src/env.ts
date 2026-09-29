// Carga .env si existe (Node >= 20.12). Debe importarse antes que cualquier modulo
// que lea process.env al cargarse. En produccion basta con exportar las variables.
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}
