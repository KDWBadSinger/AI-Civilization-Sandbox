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
- Generate nation cities from territory size and local resource density.
- Province borders are rendered as light dashed lines.
- Nation borders are rendered with a colored country edge and a light solid line.
- Cities and capital markers are shown on the political map.
- Nation names are shown near capital cities.
- Click a province to highlight it and inspect terrain, climate, area, and resources.
- Click a city to inspect population, monthly gold, army, defense, and empty building slots.
- Switch between political, terrain, and resources map modes.
- Resource nodes are only visible on the resources map mode.
- Run, pause, and speed up world time at 1x, 2x, or 5x.
- Settle national gold and resource stockpiles every simulated month.
- Generate initial nation-to-nation attitude values from -100 to 100.
- Inspect each nation's attitude toward other nations in the nation detail panel.
- Collapse or expand the right-side information panel.
- Hover resource nodes to inspect monthly output.
- Click a nation name to inspect its capital city, major cities, province count, monthly output, current resources, and resource sites.
