"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const levels_1 = require("./routes/levels");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "public")));
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api/levels", levels_1.levelsRouter);
app.listen(PORT, () => {
    console.log(`Artificial Levels API escuchando en http://localhost:${PORT}`);
});
