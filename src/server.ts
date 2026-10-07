import "./env";
import path from "path";
import express from "express";
import { attachUser } from "./auth/auth";
import { authRouter } from "./routes/auth";
import { levelsRouter } from "./routes/levels";
import { dbReady } from "./store/db";

const app = express();
const PORT = process.env.PORT || 3000;

// En la nube la app corre detras de un proxy: sin esto, el limite por IP
// veria a todos los usuarios como una sola IP (la del proxy).
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/levels", levelsRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Error interno. Intenta de nuevo." });
});

dbReady
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Artificial Levels API escuchando en http://localhost:${PORT}`);
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("ANTHROPIC_API_KEY no definida: se usara el interprete por palabras clave.");
      }
    });
  })
  .catch((error) => {
    console.error("No se pudo abrir la base de datos:", error);
    process.exit(1);
  });
