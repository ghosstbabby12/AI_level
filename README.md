# Artificial Levels: backend

API que convierte una descripción en un videojuego jugable. Node + Express + TypeScript, base SQLite (Turso) y la API de Claude.

## Arquitectura (Clean Architecture)

Las dependencias apuntan siempre hacia adentro: `interfaces` → `application` → `domain`. El dominio no conoce la base de datos, HTTP ni la IA.

```
src/
  server.ts            punto de entrada: migra la base, limpia tras un reinicio y arranca HTTP + WebSocket
  container.ts         raíz de composición: decide qué implementación respalda cada puerto
  config/              variables de entorno, leídas en un solo lugar
  domain/              reglas puras del juego, sin E/S
    level/             tipos, cuadrícula, modos, temas, codificación del mapa
    generation/        generadores por estilo (builders/), validador, calidad, descripción
    interpretation/    intérprete por palabras clave (respaldo sin IA)
    progression/       nivel siguiente, más difícil
    settings/          ajustes editables y variantes
    editing/           reglas para editar título, historia y mapa
    user/              reglas de los datos de cuenta y de la sesión
    rendering/         mapa en ASCII y SVG
  application/         casos de uso y los puertos (interfaces) que necesitan
    ports/             contratos: repositorios, intérprete de IA, escritor de juegos, trabajos...
    levels/ auth/ profile/
  infrastructure/      implementaciones de los puertos
    database/          cliente, esquema y migración
    repositories/      niveles, usuarios, sesiones, fotos, trabajos, registro y cuota
    ai/                intérprete y escritor de juegos con Claude (prompts en prompts/)
    jobs/ realtime/ security/
  interfaces/http/     Express: app, rutas, middleware y presentadores JSON
  tests/               pruebas con servidores y bases temporales
```

## Desarrollo

```bash
npm install
FRONTEND_DIR=../AI_level-frontend npm run dev   # http://localhost:3000
npm test                                        # sin IA real; npm run test:ai usa la API
```
