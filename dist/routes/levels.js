"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.levelsRouter = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const levelBuilder_1 = require("../generator/levelBuilder");
const parser_1 = require("../generator/parser");
const asciiRenderer_1 = require("../renderer/asciiRenderer");
const svgRenderer_1 = require("../renderer/svgRenderer");
const levelStore_1 = require("../store/levelStore");
exports.levelsRouter = (0, express_1.Router)();
const MAX_DESCRIPTION_LENGTH = 500;
exports.levelsRouter.post("/generate", (req, res) => {
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
    const spec = (0, parser_1.parseDescription)(description, seed);
    try {
        const { grid, placed } = (0, levelBuilder_1.buildLevel)(spec);
        const ascii = (0, asciiRenderer_1.renderAscii)(grid, spec.theme, spec.layout);
        const level = (0, levelBuilder_1.toGeneratedLevel)((0, uuid_1.v4)(), spec, grid, placed, ascii);
        (0, levelStore_1.saveLevel)(level);
        return res.status(201).json({ ...level, imageUrl: `/api/levels/${level.id}/image` });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
exports.levelsRouter.get("/:id", (req, res) => {
    const level = (0, levelStore_1.getLevel)(req.params.id);
    if (!level) {
        return res.status(404).json({ error: "Nivel no encontrado." });
    }
    return res.json({ ...level, imageUrl: `/api/levels/${level.id}/image` });
});
exports.levelsRouter.get("/:id/image", (req, res) => {
    const level = (0, levelStore_1.getLevel)(req.params.id);
    if (!level) {
        return res.status(404).json({ error: "Nivel no encontrado." });
    }
    res.setHeader("Content-Type", "image/svg+xml");
    return res.send((0, svgRenderer_1.renderSvg)(level.grid, level.theme, level.layout));
});
