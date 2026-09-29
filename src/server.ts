import "./env";
import path from "path";
import express from "express";
import { attachUser } from "./auth/auth";
import { authRouter } from "./routes/auth";
import { levelsRouter } from "./routes/levels";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/levels", levelsRouter);

app.listen(PORT, () => {
  console.log(`Artificial Levels API escuchando en http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY no definida: se usara el interprete por palabras clave.");
  }
});
