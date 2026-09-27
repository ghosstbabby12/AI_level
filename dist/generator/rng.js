"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRng = createRng;
function createRng(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min, max) => min + Math.floor(next() * (max - min + 1));
    return {
        next,
        int,
        chance: (p) => next() < p,
        pick: (items) => items[int(0, items.length - 1)],
        shuffle: (items) => {
            const copy = [...items];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = int(0, i);
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },
    };
}
