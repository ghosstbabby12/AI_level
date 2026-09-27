import path from "path";
import express from "express";
import { levelsRouter } from "./routes/levels";

// Carga .env si existe (Node >= 20.12). En produccion basta con exportar las variables.
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del entorno
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/levels", levelsRouter);

app.listen(PORT, () => {
  console.log(`Artificial Levels API escuchando en http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY no definida: se usara el interprete por palabras clave.");
  }
});
