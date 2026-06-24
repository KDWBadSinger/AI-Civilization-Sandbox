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
- Store diplomacy state separately from relations, including wars, alliances, vassal contracts, truces, and proposals.
- Inspect each nation's active diplomacy status in the nation detail panel.
- Execute diplomacy policies into wars or pending diplomacy proposals during monthly simulation.
- Evaluate diplomacy proposals after they have been pending for at least one simulated month.
- Record major diplomatic events in a scrollable left-side event log.
- Switch the event log between a world overview and a per-nation two-year history.
- Store expansion, economy, and diplomacy policy directions per nation and reassess them every six simulated months.
- Assign up to three parallel spy mission intents per nation.
- Inspect each nation's current policies and spy mission intents in the nation detail panel.
- Maintain up to three persistent spy entities per nation, with dispatch, activation, reassignment, and expiry records.
- Execute intelligence, relation improvement, relation damage, and discord missions from AI spy intents.
- Activate intelligence reports after six simulated months and retain superseded reports for four more months.
- Display deployed spies, task timing, and active enemy army/resource intelligence in the nation detail panel.
- Record spy dispatches, intelligence gains, and covert relation effects in the world event log.
- Return from a city detail back to the nation detail panel when the city was opened from that nation.
- Collapse or expand the right-side information panel.
- Hover resource nodes to inspect monthly output.
- Click a nation name to inspect its capital city, major cities, province count, monthly output, current resources, and resource sites.
