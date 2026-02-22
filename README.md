# Arena Assault

A 3D first-person shooter built with Three.js. Fight waves of increasingly difficult robot enemies in a neon-lit arena. No build tools required — just open `index.html` in a browser.

## How to Play

Open `index.html` directly, or serve the folder with any static HTTP server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Controls

| Key | Action |
|-----|--------|
| ↑ / W | Move forward |
| ↓ / S | Move backward |
| ← / A | Turn left |
| → / D | Turn right |
| Space | Shoot |
| Shift | Sprint (drains stamina) |
| R | Reload |

## Features

- **4 Difficulty Levels** — Easy, Normal, Hard, Nightmare. Each changes enemy HP, speed, accuracy, burst fire, and player stats.
- **Wave System** — After eliminating the enemy, a new one spawns with more HP and faster reactions. Survive as many waves as you can.
- **Score & Combo** — Earn points for hits (100), kills (500+), pickups, and wave completions. Landing consecutive hits builds a combo multiplier.
- **Pickups** — Health (green) and ammo (blue) pickups spawn around the arena. Collect them by walking over them. They appear on the minimap.
- **Sprint** — Hold Shift while moving for a speed boost. Uses stamina that regenerates when not sprinting.
- **Ammo & Reload** — 30-round magazine. Press R to reload manually, or it auto-reloads when empty.
- **Minimap** — Top-right radar shows the enemy (red), pickups (green/blue), and your facing direction.
- **Modern HUD** — Health bars, ammo counter, score display, wave indicator, stamina bar, combo tracker, kill feed, and game timer.
- **Visual Effects** — Particle impacts, muzzle flash, gun recoil animation, head bobbing, screen shake on damage, hit markers, low-health vignette pulse.

## Tech

- **Three.js r128** (loaded from CDN)
- Vanilla JavaScript, no framework or build step
- All geometry is procedural (no external assets)

## Project Structure

```
game/
├── index.html    # Page structure, HUD, menus, and all CSS
├── game.js       # Game logic, rendering, AI, and systems
└── README.md
```
