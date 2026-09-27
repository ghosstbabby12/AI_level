"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveLevel = saveLevel;
exports.getLevel = getLevel;
const MAX_LEVELS = 200;
const levels = new Map();
function saveLevel(level) {
    levels.set(level.id, level);
    if (levels.size > MAX_LEVELS) {
        const oldestKey = levels.keys().next().value;
        if (oldestKey)
            levels.delete(oldestKey);
    }
}
function getLevel(id) {
    return levels.get(id);
}
