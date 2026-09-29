(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ---------- Tema claro / oscuro ---------- */

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  function currentTheme() {
    return document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");
  }

  function paintThemeIcon() {
    const dark = currentTheme() === "dark";
    // Los <svg> no tienen la propiedad .hidden: hay que usar el atributo.
    $("icon-sun").toggleAttribute("hidden", !dark);
    $("icon-moon").toggleAttribute("hidden", dark);
    $("theme-toggle").setAttribute("aria-label", dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  }

  $("theme-toggle").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (_) {}
    paintThemeIcon();
  });
  systemDark.addEventListener("change", paintThemeIcon);
  paintThemeIcon();

  /* ---------- Sesion ---------- */

  let authMode = "login";

  function setAuthMode(mode) {
    authMode = mode;
    const register = mode === "register";
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    $("field-name").hidden = !register;
    $("auth-submit").textContent = register ? "Crear cuenta" : "Iniciar sesión";
    $("auth-password").autocomplete = register ? "new-password" : "current-password";
    $("auth-switch-hint").textContent = register ? "¿Ya tienes cuenta? Elige «Iniciar sesión»." : "¿No tienes cuenta? Elige «Crear cuenta».";
    $("auth-error").textContent = "";
  }
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));

  function showAuth() {
    $("app-view").hidden = true;
    $("user-menu").hidden = true;
    $("auth-view").hidden = false;
    $("auth-email").focus();
  }

  function showApp(user) {
    $("auth-view").hidden = true;
    $("app-view").hidden = false;
    $("user-menu").hidden = false;
    $("user-avatar").textContent = user.name.charAt(0).toUpperCase();
    $("user-name").textContent = user.name;
    $("greeting").textContent = `Hola, ${user.name}. ¿Qué nivel quieres jugar hoy?`;
    $("description").focus();
  }

  $("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("auth-submit");
    const payload = { email: $("auth-email").value, password: $("auth-password").value };
    if (authMode === "register") payload.name = $("auth-name").value;

    $("auth-error").textContent = "";
    submit.disabled = true;
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      $("auth-password").value = "";
      showApp(data.user);
    } catch (err) {
      $("auth-error").textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  $("logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (game) { game.destroy(); game = null; }
    $("result").hidden = true;
    $("intro").hidden = false;
    $("chips").replaceChildren();
    setAuthMode("login");
    showAuth();
  });

  /* ---------- Generador ---------- */

  const EXAMPLES = [
    { tag: "Plataformas", text: "mapa tipo Mario Bros con trampas, diseño pixelado y jefe final" },
    { tag: "Laberinto", text: "un laberinto de hielo con trampas" },
    { tag: "Mazmorra", text: "mazmorra con salas, 5 trampas, muchos enemigos y jefe final, difícil" },
    { tag: "Espacio", text: "plataformas en el espacio con monedas, difícil" },
  ];

  const input = $("description");
  const submit = $("submit");
  const errorEl = $("error");
  const canvas = $("game");
  let game = null;

  for (const example of EXAMPLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = example.tag;
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = example.text;
    button.append(tag, text);
    button.addEventListener("click", () => { input.value = example.text; generate(); });
    $("examples").appendChild(button);
  }

  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
    if (name === "play") canvas.focus();
  }
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("restart").addEventListener("click", () => { if (game) game.restart(); canvas.focus(); });
  $("regen").addEventListener("click", generate);

  async function generate() {
    if (!input.value.trim()) { input.focus(); return; }
    errorEl.textContent = "";
    submit.disabled = true;
    submit.textContent = "Generando…";
    try {
      const res = await fetch("/api/levels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input.value }),
      });
      const level = await res.json();
      if (res.status === 401) { showAuth(); return; }
      if (!res.ok) throw new Error(level.error || "Error al generar el nivel");

      $("chips").replaceChildren(...level.interpretation.map((text) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = text;
        return chip;
      }));

      $("image").src = level.imageUrl;
      $("ascii").textContent = level.ascii;
      $("hint").textContent = level.layout === "platformer"
        ? "Mover: flechas o A/D · Saltar: ↑ / W / Espacio (mantén para saltar más alto) · Pisa a los enemigos y al jefe desde arriba · R reinicia"
        : "Mover: flechas o WASD · Atacar: caminar contra un enemigo o Espacio · Las trampas y enemigos quitan vida · R reinicia";

      $("intro").hidden = true;
      $("result").hidden = false;
      if (game) game.destroy();
      game = window.LevelGame.create(canvas, level);
      showTab("play");
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Generar";
    }
  }

  $("form").addEventListener("submit", (event) => { event.preventDefault(); generate(); });

  /* ---------- Arranque ---------- */

  fetch("/api/auth/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data ? showApp(data.user) : showAuth()))
    .catch(showAuth);
})();
