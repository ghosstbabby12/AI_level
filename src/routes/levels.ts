import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { buildLevel, toGeneratedLevel } from "../generator/levelBuilder";
import { parseDescription } from "../generator/parser";
import { renderAscii } from "../renderer/asciiRenderer";
import { renderSvg } from "../renderer/svgRenderer";
import { getLevel, saveLevel } from "../store/levelStore";

export const levelsRouter = Router();

const MAX_DESCRIPTION_LENGTH = 500;

levelsRouter.post("/generate", async (req, res) => {
  const { description, seed } = req.body ?? {};

  if (typeof description !== "string" || description.trim().length === 0) {
    return res.status(400).json({ error: "El campo 'description' es requerido y debe ser texto." });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `La descripcion no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.` });
  }
  if (seed !== undefined && !Number.isInteger(seed)) {
    return res.status(400).json({ error: "El campo 'seed' debe ser un entero." });
  }

  const spec = await parseDescription(description, seed);

  try {
    const { grid, placed } = buildLevel(spec);
    const ascii = renderAscii(grid, spec.theme, spec.layout);
    const level = toGeneratedLevel(uuidv4(), spec, grid, placed, ascii);
    saveLevel(level);

    return res.status(201).json({
      ...level,
      imageUrl: `/api/levels/${level.id}/image`,
      obstacles: spec.obstacles ?? [],
      interpretedBy: spec.source,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

levelsRouter.get("/:id", (req, res) => {
  const level = getLevel(req.params.id);
  if (!level) {
    return res.status(404).json({ error: "Nivel no encontrado." });
  }
  return res.json({ ...level, imageUrl: `/api/levels/${level.id}/image` });
});

levelsRouter.get("/:id/image", (req, res) => {
  const level = getLevel(req.params.id);
  if (!level) {
    return res.status(404).json({ error: "Nivel no encontrado." });
  }
  res.setHeader("Content-Type", "image/svg+xml");
  return res.send(renderSvg(level.grid, level.theme, level.layout));
});
