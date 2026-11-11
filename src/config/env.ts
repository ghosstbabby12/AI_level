// Loads .env when present (Node >= 20.12). Must be imported before any module that reads
// process.env while loading. In production, exporting the variables is enough.
try {
  process.loadEnvFile();
} catch {
  // No .env: the environment variables are used as they are.
}
