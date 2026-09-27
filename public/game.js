(function () {
  "use strict";

  const VIEW_W = 960;
  const VIEW_H = 600;

  const SPRITE_DEFS = {
    player: {
      rows: ["..rrrr..", ".rrrrrr.", ".ffeffe.", ".ffffff.", "..bbbb..", ".bbbbbb.", "..b..b..", ".ss..ss."],
      colors: { r: "#e53935", f: "#ffcc99", e: "#222222", b: "#1e64d0", s: "#6b3e1a" },
    },
    enemy: {
      rows: ["..cccc..", ".cccccc.", "cwwccwwc", "cwkccwkc", "cccccccc", ".cccccc.", "..dccd..", ".dd..dd."],
      colors: { c: "#b0602f", w: "#ffffff", k: "#111111", d: "#5a2d0c" },
    },
    boss: {
      rows: ["y.y..y.y", "yyyyyyyy", ".gggggg.", "gwkggwkg", "gggggggg", "gggmmggg", ".gggggg.", "gg.gg.gg"],
      colors: { y: "#ffd600", g: "#3aa64a", w: "#ffffff", k: "#111111", m: "#d32f2f" },
    },
    spike: {
      rows: ["........", "..l..l..", "..s..s..", ".lss.lss", ".sss.sss", "ssssssss", "dddddddd", "dddddddd"],
      colors: { l: "#f3f4f6", s: "#7b8194", d: "#2f3340" },
    },
    coin: {
      rows: ["..oooo..", ".oyyyyo.", ".oyywyo.", ".oyyyyo.", ".oyyyyo.", ".oyyyyo.", ".oyyyyo.", "..oooo.."],
      colors: { o: "#b8860b", y: "#ffd700", w: "#fff7b0" },
    },
    door: {
      rows: ["dddddddd", "dlllllld", "dlllllld", "dlllllld", "dllllyld", "dlllllld", "dlllllld", "dddddddd"],
      colors: { d: "#5d3a1a", l: "#a9713a", y: "#ffd54f" },
    },
    flag: {
      rows: [".gggg...", ".ggggg..", ".gggg...", ".p......", ".p......", ".p......", ".p......", "ppp....."],
      colors: { g: "#2ecc40", p: "#eeeeee" },
    },
  };

  function buildSprite(def) {
    const canvas = document.createElement("canvas");
    canvas.width = def.rows[0].length;
    canvas.height = def.rows.length;
    const g = canvas.getContext("2d");
    def.rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const color = def.colors[ch];
        if (color) {
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      })
    );
    return canvas;
  }

  const SPRITES = {};
  for (const name of Object.keys(SPRITE_DEFS)) SPRITES[name] = buildSprite(SPRITE_DEFS[name]);

  function hash(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    const mix = (c) => Math.round(c + (target - c) * t);
    const r = mix((n >> 16) & 255);
    const g = mix((n >> 8) & 255);
    const b = mix(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  const WALL_STYLE = {
    dungeon: "brick", lava: "brick", desert: "brick", overworld: "brick",
    ice: "bevel", water: "bevel", space: "bevel", forest: "leaf",
  };

  function tile8(paint) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const g = canvas.getContext("2d");
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = paint(x, y);
        g.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  function makeTextures(level) {
    const pal = level.palette;
    const style = WALL_STYLE[level.theme] || "brick";
    const dark = shade(pal.wall, -0.18);
    const light = shade(pal.wall, 0.18);

    const wallPaint = (variant) => (x, y) => {
      const n = hash(x, y, variant);
      if (style === "brick") {
        const band = y < 4 ? 0 : 1;
        const joints = band === 0 ? [3, 7] : [1, 5];
        if (y === 3 || y === 7 || joints.includes(x)) return pal.wallAccent;
      } else if (style === "bevel") {
        if (y === 0 || x === 0) return light;
        if (y === 7 || x === 7) return dark;
      }
      return n < 0.2 ? dark : n > 0.88 ? light : pal.wall;
    };

    const walls = [0, 1, 2, 3].map((v) => tile8(wallPaint(v)));
    const tops = [0, 1, 2, 3].map((v) =>
      tile8((x, y) => {
        if (y < 2) return pal.top;
        if (y === 2 && hash(x, 9, v) < 0.5) return shade(pal.top, -0.2);
        return wallPaint(v)(x, y);
      })
    );
    const floors = [0, 1, 2, 3].map((v) =>
      tile8((x, y) => (hash(x, y, v + 10) < 0.08 ? pal.floorAlt : (x + y + v) % 8 < 4 && v % 2 ? pal.floorAlt : pal.floor))
    );
    return { walls, tops, floors };
  }

  function createGame(canvas, level, options) {
    options = options || {};
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const grid = level.grid;
    const W = level.width;
    const H = level.height;
    const platformer = level.layout === "platformer";
    const T = platformer ? Math.floor(VIEW_H / H) : 36;
    const textures = makeTextures(level);
    const maxHp = { easy: 5, normal: 4, hard: 3 }[level.difficulty] || 4;
    const bossMaxHp = platformer
      ? { easy: 2, normal: 3, hard: 5 }[level.difficulty] || 3
      : { easy: 5, normal: 8, hard: 12 }[level.difficulty] || 8;

    const keys = new Set();
    const dirStack = [];
    let jumpPressed = false;
    let state;
    let time = 0;
    let rafId = 0;
    let lastFrame = 0;
    let camera = { x: 0, y: 0 };
    let banner = { text: "", ttl: 0 };

    const cellAt = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] : "wall");
    const solid = (x, y) => (x < 0 || x >= W ? true : y < 0 || y >= H ? false : grid[y][x] === "wall");
    const findCell = (type) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === type) return { x, y };
      return null;
    };

    function say(text, seconds) {
      banner = { text, ttl: seconds || 2.5 };
    }

    function reset() {
      const start = findCell("start");
      const items = new Set();
      const enemies = [];
      let boss = null;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const cell = grid[y][x];
          if (cell === "item") items.add(x + "," + y);
          else if (cell === "enemy") {
            enemies.push(
              platformer
                ? { x: x + 0.1, y: y + 0.2, w: 0.8, h: 0.8, dir: hash(x, y, 1) < 0.5 ? -1 : 1, alive: true }
                : { x, y, hp: 1, cd: 0.3 + hash(x, y, 2) * 0.4, flash: 0, alive: true }
            );
          } else if (cell === "boss") {
            boss = platformer
              ? { x, y: y - 1, w: 1.9, h: 1.9, vx: 0, vy: 0, dir: -1, hp: bossMaxHp, invuln: 0, jumpT: 2, minX: Math.max(2, x - 9), maxX: W - 4, alive: true }
              : { x, y, hp: bossMaxHp, cd: 0.6, flash: 0, alive: true };
          }
        }
      }

      state = {
        status: "playing",
        hp: maxHp,
        score: 0,
        totalItems: items.size,
        collected: 0,
        items,
        enemies,
        boss,
        invuln: 0,
        flash: 0,
        exit: findCell("exit"),
        player: platformer
          ? { x: start.x + 0.15, y: start.y + 0.1, w: 0.7, h: 0.9, vx: 0, vy: 0, onGround: false, coyote: 0, jumpBuf: 0, facing: 1, safe: { x: start.x + 0.15, y: start.y + 0.1 } }
          : { x: start.x, y: start.y, dir: { x: 1, y: 0 }, moveCd: 0 },
        dist: null,
      };
      if (!platformer) state.dist = distanceField(state.player.x, state.player.y);
      dirStack.length = 0;
      jumpPressed = false;
      say(state.boss ? "Derrota al jefe y llega a la salida" : "Llega a la salida", 3);
    }

    function bossAlive() {
      return !!(state.boss && state.boss.alive);
    }

    function hurt(amount, bypass) {
      if (state.status !== "playing") return false;
      if (!bypass && state.invuln > 0) return false;
      state.hp -= amount;
      state.invuln = 1.2;
      state.flash = 0.25;
      if (state.hp <= 0) {
        state.hp = 0;
        state.status = "lost";
        say("Has perdido. Pulsa R para reintentar", 999);
      }
      return true;
    }

    function collect(x, y) {
      const key = x + "," + y;
      if (state.items.has(key)) {
        state.items.delete(key);
        state.collected++;
        state.score += 10;
      }
    }

    function win() {
      if (state.status !== "playing") return;
      state.status = "won";
      say("¡Nivel completado! Puntos: " + state.score + " - Pulsa R para repetir", 999);
    }

    function tryExit() {
      if (bossAlive()) say("La salida está cerrada: derrota al jefe", 1.5);
      else win();
    }

    function killBoss() {
      state.boss.alive = false;
      state.score += 200;
      say("¡Jefe derrotado! La salida está abierta", 3);
    }

    // ---------------------------------------------------------------- top-down
    function distanceField(px, py) {
      const dist = Array.from({ length: H }, () => Array(W).fill(-1));
      dist[py][px] = 0;
      const queue = [[px, py]];
      for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && dist[ny][nx] === -1 && grid[ny][nx] !== "wall") {
            dist[ny][nx] = dist[y][x] + 1;
            queue.push([nx, ny]);
          }
        }
      }
      return dist;
    }

    function entityAt(x, y) {
      for (const e of state.enemies) if (e.alive && e.x === x && e.y === y) return e;
      if (bossAlive() && state.boss.x === x && state.boss.y === y) return state.boss;
      return null;
    }

    function hitEntity(entity) {
      entity.hp--;
      entity.flash = 0.2;
      if (entity.hp > 0) return;
      entity.alive = false;
      if (entity === state.boss) killBoss();
      else state.score += 25;
    }

    function tdMove(dx, dy) {
      const p = state.player;
      p.dir = { x: dx, y: dy };
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (solid(nx, ny)) return;
      const target = entityAt(nx, ny);
      if (target) {
        hitEntity(target);
        return;
      }
      p.x = nx;
      p.y = ny;
      state.dist = distanceField(nx, ny);
      collect(nx, ny);
      if (cellAt(nx, ny) === "trap") {
        if (hurt(1)) say("¡Trampa!", 0.8);
      }
      if (state.exit && nx === state.exit.x && ny === state.exit.y) tryExit();
    }

    function tdAttack() {
      const p = state.player;
      const target = entityAt(p.x + p.dir.x, p.y + p.dir.y);
      if (target) hitEntity(target);
    }

    function stepEnemy(e, isBoss, dt) {
      e.flash = Math.max(0, e.flash - dt);
      e.cd -= dt;
      if (e.cd > 0) return;
      const p = state.player;
      const speed = isBoss ? { easy: 0.7, normal: 0.55, hard: 0.42 }[level.difficulty] || 0.55 : 0.5;
      e.cd = speed;

      const here = state.dist[e.y][e.x];
      const chase = isBoss ? here !== -1 : here !== -1 && here <= 8;
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy }))
        .filter((c) => !solid(c.x, c.y));

      if (chase && here > 0) {
        const best = options
          .filter((c) => state.dist[c.y][c.x] !== -1)
          .sort((a, b) => state.dist[a.y][a.x] - state.dist[b.y][b.x])[0];
        if (best && best.x === p.x && best.y === p.y) {
          if (hurt(1)) say(isBoss ? "¡El jefe te golpea!" : "¡Te atacaron!", 0.8);
          return;
        }
        if (best && !entityAt(best.x, best.y) && state.dist[best.y][best.x] < here) {
          e.x = best.x;
          e.y = best.y;
        }
      } else if (Math.random() < 0.4 && options.length) {
        const c = options[Math.floor(Math.random() * options.length)];
        if (!entityAt(c.x, c.y) && !(c.x === p.x && c.y === p.y)) {
          e.x = c.x;
          e.y = c.y;
        }
      }
    }

    function updateTopDown(dt) {
      const p = state.player;
      p.moveCd -= dt;
      const dir = dirStack[dirStack.length - 1];
      if (dir && p.moveCd <= 0) {
        tdMove(dir[0], dir[1]);
        p.moveCd = 0.13;
      }
      for (const e of state.enemies) if (e.alive) stepEnemy(e, false, dt);
      if (bossAlive()) stepEnemy(state.boss, true, dt);
    }

    // -------------------------------------------------------------- platformer
    const GRAVITY = 40;
    const MOVE_SPEED = 6;
    const JUMP_SPEED = 18.5;

    function collides(x, y, w, h) {
      for (let ty = Math.floor(y); ty <= Math.floor(y + h - 1e-6); ty++) {
        for (let tx = Math.floor(x); tx <= Math.floor(x + w - 1e-6); tx++) {
          if (solid(tx, ty)) return true;
        }
      }
      return false;
    }

    function overlaps(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function approach(value, target, amount) {
      return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
    }

    function moveBody(b, dt) {
      b.x += b.vx * dt;
      if (collides(b.x, b.y, b.w, b.h)) {
        b.x = b.vx > 0 ? Math.floor(b.x + b.w) - b.w - 1e-4 : Math.floor(b.x) + 1 + 1e-4;
        b.vx = 0;
      }
      b.y += b.vy * dt;
      b.onGround = false;
      if (collides(b.x, b.y, b.w, b.h)) {
        if (b.vy > 0) {
          b.y = Math.floor(b.y + b.h) - b.h - 1e-4;
          b.onGround = true;
        } else {
          b.y = Math.floor(b.y) + 1 + 1e-4;
        }
        b.vy = 0;
      }
    }

    function respawn() {
      const p = state.player;
      p.x = p.safe.x;
      p.y = p.safe.y;
      p.vx = 0;
      p.vy = 0;
      state.invuln = 1.5;
    }

    function stepEnemyWalker(e, dt) {
      e.x += e.dir * 1.6 * dt;
      const aheadX = Math.floor(e.dir > 0 ? e.x + e.w + 0.05 : e.x - 0.05);
      const bodyY = Math.floor(e.y + e.h / 2);
      const footY = Math.floor(e.y + e.h + 0.05);
      const blocked = solid(aheadX, bodyY) || !solid(aheadX, footY) || cellAt(aheadX, Math.floor(e.y + e.h - 0.3)) === "trap";
      if (blocked) {
        e.dir = -e.dir;
        e.x += e.dir * 1.6 * dt * 2;
      }
    }

    function stepBoss(b, dt) {
      b.invuln = Math.max(0, b.invuln - dt);
      const speed = 2.4 + (bossMaxHp - b.hp) * 0.7;
      b.vx = b.dir * speed;
      b.vy = Math.min(b.vy + GRAVITY * dt, 25);
      b.jumpT -= dt;
      if (b.jumpT <= 0 && b.onGround) {
        b.vy = -14;
        b.jumpT = 1.6 + Math.random() * 1.6;
      }
      moveBody(b, dt);
      if (b.x <= b.minX) b.dir = 1;
      if (b.x >= b.maxX) b.dir = -1;
      b.x = Math.min(b.maxX, Math.max(b.minX, b.x));
    }

    function stepPlatformer(dt) {
      const p = state.player;
      const left = keys.has("ArrowLeft") || keys.has("KeyA");
      const right = keys.has("ArrowRight") || keys.has("KeyD");
      const target = (right ? 1 : 0) - (left ? 1 : 0);
      if (target) p.facing = target;
      p.vx = approach(p.vx, target * MOVE_SPEED, (target ? 70 : 60) * dt);
      p.vy = Math.min(p.vy + GRAVITY * dt, 25);

      p.coyote = p.onGround ? 0.1 : Math.max(0, p.coyote - dt);
      p.jumpBuf = Math.max(0, p.jumpBuf - dt);
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = -JUMP_SPEED;
        p.jumpBuf = 0;
        p.coyote = 0;
      }
      const jumpHeld = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space");
      if (!jumpHeld && p.vy < -7) p.vy = -7;

      moveBody(p, dt);

      if (p.onGround) {
        const cx = Math.floor(p.x + p.w / 2);
        if (solid(cx, Math.floor(p.y + p.h + 0.1)) && solid(cx - 1, Math.floor(p.y + p.h + 0.1)) && solid(cx + 1, Math.floor(p.y + p.h + 0.1))) {
          p.safe = { x: p.x, y: p.y };
        }
      }

      if (p.y > H + 1) {
        if (hurt(1, true)) say("¡Caíste al vacío!", 1);
        if (state.status === "playing") respawn();
        return;
      }

      for (let ty = Math.floor(p.y); ty <= Math.floor(p.y + p.h); ty++) {
        for (let tx = Math.floor(p.x); tx <= Math.floor(p.x + p.w); tx++) {
          collect(tx, ty);
          if (cellAt(tx, ty) === "trap") {
            const spike = { x: tx + 0.1, y: ty + 0.5, w: 0.8, h: 0.5 };
            if (overlaps(p, spike) && hurt(1)) {
              p.vy = -10;
              say("¡Pinchos!", 0.8);
            }
          }
        }
      }

      for (const e of state.enemies) {
        if (!e.alive) continue;
        stepEnemyWalker(e, dt);
        if (!overlaps(p, e)) continue;
        if (p.vy > 0 && p.y + p.h - e.y < 0.6) {
          e.alive = false;
          p.vy = -11;
          state.score += 25;
        } else if (hurt(1)) {
          p.vx = (p.x < e.x ? -1 : 1) * 7;
          p.vy = -8;
        }
      }

      if (bossAlive()) {
        const b = state.boss;
        stepBoss(b, dt);
        if (overlaps(p, b) && b.invuln <= 0) {
          if (p.vy > 0 && p.y + p.h - b.y < 0.8) {
            b.hp--;
            b.invuln = 1.2;
            p.vy = -14;
            if (b.hp <= 0) killBoss();
            else say("¡Golpe al jefe! Le quedan " + b.hp, 1);
          } else if (hurt(1)) {
            p.vx = (p.x < b.x ? -1 : 1) * 9;
            p.vy = -9;
            say("¡El jefe te golpea!", 0.8);
          }
        }
      }

      const exit = state.exit;
      if (exit && overlaps(p, { x: exit.x - 0.2, y: -20, w: 1.4, h: exit.y + 21 })) tryExit();
    }

    function updatePlatformer(dt) {
      const step = 1 / 120;
      let remaining = Math.min(dt, 0.05);
      while (remaining > 0 && state.status === "playing") {
        const h = Math.min(step, remaining);
        stepPlatformer(h);
        remaining -= h;
      }
    }

    // ------------------------------------------------------------------ update
    function update(dt) {
      time += dt;
      banner.ttl -= dt;
      if (state.status !== "playing") return;
      state.invuln = Math.max(0, state.invuln - dt);
      state.flash = Math.max(0, state.flash - dt);
      if (platformer) updatePlatformer(dt);
      else updateTopDown(dt);
    }

    // ------------------------------------------------------------------ render
    function playerPos() {
      const p = state.player;
      return platformer ? { x: (p.x + p.w / 2) * T, y: (p.y + p.h / 2) * T } : { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T };
    }

    function updateCamera() {
      const target = playerPos();
      const mapW = W * T;
      const mapH = H * T;
      const fit = (pos, view, size) => (size <= view ? (size - view) / 2 : Math.min(size - view, Math.max(0, pos - view / 2)));
      camera.x = fit(target.x, VIEW_W, mapW);
      camera.y = fit(target.y, VIEW_H, mapH);
    }

    function drawSprite(name, x, y, w, h, flip) {
      const sx = Math.round(x - camera.x);
      const sy = Math.round(y - camera.y);
      if (flip) {
        ctx.save();
        ctx.translate(sx + w, sy);
        ctx.scale(-1, 1);
        ctx.drawImage(SPRITES[name], 0, 0, Math.round(w), Math.round(h));
        ctx.restore();
      } else {
        ctx.drawImage(SPRITES[name], sx, sy, Math.round(w), Math.round(h));
      }
    }

    function drawTexture(canvasTile, tx, ty) {
      ctx.drawImage(canvasTile, Math.round(tx * T - camera.x), Math.round(ty * T - camera.y), T, T);
    }

    function drawBackground() {
      const pal = level.palette;
      if (platformer) {
        const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        gradient.addColorStop(0, pal.sky[0]);
        gradient.addColorStop(1, pal.sky[1]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);

        if (level.theme === "overworld" || level.theme === "forest" || level.theme === "desert") {
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          for (let i = 0; i < 40; i++) {
            const cx = ((i * 260 + hash(i, 1, 5) * 120 - camera.x * 0.3) % (VIEW_W + 200)) - 100;
            const cy = 30 + hash(i, 2, 5) * 150;
            const u = 8;
            ctx.fillRect(cx, cy + u, u * 7, u * 2);
            ctx.fillRect(cx + u, cy, u * 5, u * 3);
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          for (let i = 0; i < 70; i++) {
            const sx = ((hash(i, 3, 6) * (VIEW_W + 400) - camera.x * 0.2) % (VIEW_W + 40));
            ctx.fillRect(sx < 0 ? sx + VIEW_W : sx, hash(i, 4, 6) * VIEW_H * 0.8, 3, 3);
          }
        }
      } else {
        ctx.fillStyle = shade(pal.wall, -0.35);
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }

    function drawTiles() {
      const x0 = Math.max(0, Math.floor(camera.x / T));
      const x1 = Math.min(W - 1, Math.floor((camera.x + VIEW_W) / T));
      const y0 = Math.max(0, Math.floor(camera.y / T));
      const y1 = Math.min(H - 1, Math.floor((camera.y + VIEW_H) / T));
      const locked = bossAlive();

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const cell = grid[y][x];
          const variant = Math.floor(hash(x, y, 7) * 4);
          if (cell === "wall") {
            const exposed = platformer && !solid(x, y - 1);
            drawTexture(exposed ? textures.tops[variant] : textures.walls[variant], x, y);
            continue;
          }
          if (!platformer) drawTexture(textures.floors[variant], x, y);

          if (cell === "trap") drawSprite("spike", x * T, y * T, T, T);
          else if (cell === "exit") {
            if (platformer) drawSprite("flag", x * T, (y - 1) * T, T, T * 2);
            else drawSprite("door", x * T, y * T, T, T);
            if (locked) {
              ctx.fillStyle = "rgba(30,30,50,0.55)";
              ctx.fillRect(Math.round(x * T - camera.x), Math.round((platformer ? y - 1 : y) * T - camera.y), T, platformer ? T * 2 : T);
            }
          } else if (cell === "start" && !platformer) {
            ctx.strokeStyle = "rgba(34,197,94,0.8)";
            ctx.lineWidth = 3;
            ctx.strokeRect(Math.round(x * T - camera.x) + 6, Math.round(y * T - camera.y) + 6, T - 12, T - 12);
          }
        }
      }

      for (const key of state.items) {
        const [x, y] = key.split(",").map(Number);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const bob = Math.sin(time * 4 + x) * T * 0.06;
        drawSprite("coin", x * T + T * 0.15, y * T + T * 0.15 + bob, T * 0.7, T * 0.7);
      }
    }

    function blink(invuln) {
      return invuln > 0 && Math.floor(time * 16) % 2 === 0;
    }

    function drawEntities() {
      const p = state.player;
      if (platformer) {
        for (const e of state.enemies) if (e.alive) drawSprite("enemy", (e.x - 0.05) * T, (e.y - 0.1) * T, T * 0.9, T * 0.9, e.dir > 0);
        if (bossAlive()) {
          const b = state.boss;
          if (!blink(b.invuln)) drawSprite("boss", (b.x - 0.05) * T, (b.y - 0.05) * T, T * 2, T * 2, b.dir > 0);
        }
        if (!blink(state.invuln)) drawSprite("player", (p.x - 0.1) * T, (p.y - 0.05) * T, T * 0.9, T * 0.95, p.facing < 0);
      } else {
        for (const e of state.enemies) {
          if (e.alive && !(e.flash > 0 && Math.floor(time * 20) % 2)) drawSprite("enemy", e.x * T, e.y * T, T, T);
        }
        if (bossAlive() && !(state.boss.flash > 0 && Math.floor(time * 20) % 2)) {
          drawSprite("boss", state.boss.x * T - T * 0.15, state.boss.y * T - T * 0.15, T * 1.3, T * 1.3);
        }
        if (!blink(state.invuln)) drawSprite("player", p.x * T, p.y * T, T, T, p.dir.x < 0);
      }
    }

    function drawHud() {
      ctx.font = "bold 22px monospace";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(8, 8, 300, 34);
      ctx.fillStyle = "#ff5252";
      ctx.fillText("♥".repeat(state.hp) + "♡".repeat(Math.max(0, maxHp - state.hp)), 16, 13);
      ctx.fillStyle = "#ffd700";
      ctx.fillText("●" + state.collected + "/" + state.totalItems + "  " + state.score + "pts", 130, 13);

      if (bossAlive()) {
        const width = 260;
        const ratio = state.boss.hp / bossMaxHp;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(VIEW_W - width - 24, 8, width + 16, 34);
        ctx.fillStyle = "#7e22ce";
        ctx.fillRect(VIEW_W - width - 16, 16, width * ratio, 18);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(VIEW_W - width - 16, 16, width, 18);
      }

      if (banner.ttl > 0) {
        ctx.textAlign = "center";
        ctx.font = "bold 24px monospace";
        const w = ctx.measureText(banner.text).width + 32;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(VIEW_W / 2 - w / 2, VIEW_H - 70, w, 44);
        ctx.fillStyle = state.status === "won" ? "#7CFC00" : state.status === "lost" ? "#ff6b6b" : "#ffffff";
        ctx.fillText(banner.text, VIEW_W / 2, VIEW_H - 59);
        ctx.textAlign = "left";
      }

      if (state.flash > 0) {
        ctx.fillStyle = "rgba(255,0,0," + state.flash + ")";
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }

    function render() {
      updateCamera();
      drawBackground();
      drawTiles();
      drawEntities();
      drawHud();
    }

    // ------------------------------------------------------------------- input
    const DIRS = {
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    };
    const HANDLED = new Set([...Object.keys(DIRS), "Space"]);
    const DIRS_LOOKUP = (dir) => Object.keys(DIRS).find((code) => DIRS[code] === dir);

    function handleDown(code) {
      keys.add(code);
      if (platformer) {
        if (["ArrowUp", "KeyW", "Space"].includes(code)) state.player.jumpBuf = 0.12;
      } else {
        if (DIRS[code]) {
          dirStack.push(DIRS[code]);
          state.player.moveCd = Math.min(state.player.moveCd, 0);
        }
        if (code === "Space" && state.status === "playing") tdAttack();
      }
    }

    function handleUp(code) {
      keys.delete(code);
      if (DIRS[code]) {
        const index = dirStack.indexOf(DIRS[code]);
        if (index !== -1) dirStack.splice(index, 1);
      }
    }

    function onKeyDown(event) {
      if (event.target && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (HANDLED.has(event.code)) event.preventDefault();
      if (event.code === "KeyR" || (event.code === "Enter" && state.status !== "playing")) {
        reset();
        return;
      }
      if (!event.repeat) handleDown(event.code);
    }

    function onKeyUp(event) {
      handleUp(event.code);
    }

    function onBlur() {
      keys.clear();
      dirStack.length = 0;
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
      lastFrame = now;
      update(dt);
      render();
      rafId = requestAnimationFrame(frame);
    }

    reset();
    if (!options.manual) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      rafId = requestAnimationFrame(frame);
    } else {
      render();
    }

    return {
      restart: reset,
      destroy() {
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
      },
      // API para pruebas automatizadas
      step(dt) {
        update(dt);
      },
      render,
      press(code) {
        if (!keys.has(code)) handleDown(code);
      },
      release: handleUp,
      snapshot() {
        return { state: structuredClone(state), keys: [...keys], dirs: dirStack.map((d) => DIRS_LOOKUP(d)) };
      },
      restore(snap) {
        state = structuredClone(snap.state);
        keys.clear();
        dirStack.length = 0;
        for (const code of snap.keys) keys.add(code);
        for (const code of snap.dirs) dirStack.push(DIRS[code]);
      },
      get state() {
        return state;
      },
      get tile() {
        return T;
      },
    };
  }

  window.LevelGame = { create: createGame };
})();
