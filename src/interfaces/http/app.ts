import path from "path";
import express, { Express } from "express";
import { Deps } from "../../application/ports";
import { config } from "../../config/config";
import { errorHandler } from "./middleware/errorHandler";
import { createRateLimits } from "./middleware/rateLimits";
import { attachUser } from "./middleware/session";
import { authRoutes } from "./routes/authRoutes";
import { levelRoutes } from "./routes/levelRoutes";
import { profileRoutes } from "./routes/profileRoutes";
import { realtimeRoutes } from "./routes/realtimeRoutes";

/** Builds the Express app around the given dependencies (the real container, or fakes in tests). */
export function createApp(deps: Deps): Express {
  const app = express();
  const limits = createRateLimits();
  app.set("trust proxy", config.trustProxy);
  app.use(express.json());
  if (config.frontendDir) app.use(express.static(path.resolve(config.frontendDir)));

  app.get("/", (_req, res) => res.json({ name: "Artificial Levels API", health: "/api/health" }));
  app.use(attachUser(deps.sessions));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes(deps, limits));
  app.use("/api/levels", levelRoutes(deps, limits));
  app.use("/api/profile", profileRoutes(deps, limits));
  app.use("/api/realtime", realtimeRoutes(limits));
  app.use(errorHandler);
  return app;
}
