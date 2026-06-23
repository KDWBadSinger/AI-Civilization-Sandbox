# AI-Civilization-Sandbox
A Web Sandbox for AI Civilization Simulation

## Development

This project is a browser-based AI civilization sandbox prototype built with Vite,
React, TypeScript, and PixiJS.

```bash
pnpm install
pnpm dev
```

Current map prototype:

- Drag to pan the world map.
- Use the mouse wheel to zoom.
- Generate a deterministic 96x64 world from a seed.
- Build terrain from elevation, temperature, and moisture samples.
- Place terrain-aware resource nodes.
- Split land into irregular provinces.
- Assign generated provinces to six starting nations.
- Province borders are rendered as light dashed lines.
- Nation borders are rendered as thicker solid lines.
