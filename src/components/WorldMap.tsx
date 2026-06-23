import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { MapEdge, Tile, World } from "../world/types";

export type MapMode = "political" | "terrain" | "resources";

type WorldMapProps = {
  world: World;
  mapMode: MapMode;
  selectedProvinceId?: string;
  onSelectProvince: (provinceId: string | undefined) => void;
};

const TILE_SIZE = 14;
const MIN_SCALE = 0.35;
const MAX_SCALE = 4.5;

const terrainColors = {
  ocean: 0x315f8f,
  coast: 0x4a89a8,
  plain: 0x88a95f,
  forest: 0x477457,
  hill: 0x9a8d65,
  mountain: 0x7d7f85,
  desert: 0xc9b06b,
};

const resourceColors = {
  grain: 0xe7d66f,
  timber: 0x2f5f3f,
  iron: 0xc6cad1,
  coal: 0x33363d,
  oil: 0x18191d,
};

export function WorldMap({ world, mapMode, selectedProvinceId, onSelectProvince }: WorldMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let app: Application | undefined;

    const setup = async () => {
      const pixiApp = new Application();
      await pixiApp.init({
        antialias: true,
        autoDensity: true,
        background: "#132028",
        resizeTo: host,
        resolution: window.devicePixelRatio || 1,
      });

      if (disposed) {
        pixiApp.destroy(true);
        return;
      }

      app = pixiApp;
      host.appendChild(pixiApp.canvas);

      const viewport = new Container();
      pixiApp.stage.addChild(viewport);

      const tileByCoord = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

      drawWorld(viewport, world, mapMode, selectedProvinceId, tileByCoord);
      setZoom(centerWorld(pixiApp, viewport, world));

      let dragging = false;
      let lastPointer = { x: 0, y: 0 };
      let dragStart = { x: 0, y: 0 };

      pixiApp.stage.eventMode = "static";
      pixiApp.stage.hitArea = pixiApp.screen;

      pixiApp.stage.on("pointerdown", (event) => {
        dragging = true;
        lastPointer = { x: event.global.x, y: event.global.y };
        dragStart = lastPointer;
      });

      pixiApp.stage.on("pointermove", (event) => {
        if (!dragging) {
          return;
        }

        const dx = event.global.x - lastPointer.x;
        const dy = event.global.y - lastPointer.y;
        viewport.position.set(viewport.x + dx, viewport.y + dy);
        lastPointer = { x: event.global.x, y: event.global.y };
      });

      const endDrag = (event?: { global: { x: number; y: number } }) => {
        if (event && dragging && distance(dragStart.x, dragStart.y, event.global.x, event.global.y) < 4) {
          const local = viewport.toLocal(event.global);
          const tileX = Math.floor(local.x / TILE_SIZE);
          const tileY = Math.floor(local.y / TILE_SIZE);
          const tile = tileByCoord.get(`${tileX},${tileY}`);
          onSelectProvince(tile?.provinceId);
        }

        dragging = false;
      };

      pixiApp.stage.on("pointerup", endDrag);
      pixiApp.stage.on("pointerupoutside", endDrag);

      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        const bounds = pixiApp.canvas.getBoundingClientRect();
        const pointer = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
        const beforeZoom = viewport.toLocal(pointer);
        const nextScale = clamp(
          viewport.scale.x * (event.deltaY > 0 ? 0.9 : 1.1),
          MIN_SCALE,
          MAX_SCALE,
        );

        viewport.scale.set(nextScale);
        setZoom(nextScale);
        const afterZoom = viewport.toGlobal(beforeZoom);
        viewport.position.set(
          viewport.x + pointer.x - afterZoom.x,
          viewport.y + pointer.y - afterZoom.y,
        );
      };

      pixiApp.canvas.addEventListener("wheel", handleWheel, { passive: false });

      resizeObserver = new ResizeObserver(() => {
        pixiApp.stage.hitArea = pixiApp.screen;
      });
      resizeObserver.observe(host);

      return () => {
        pixiApp.canvas.removeEventListener("wheel", handleWheel);
      };
    };

    let cleanupWheel: (() => void) | undefined;
    setup().then((cleanup) => {
      cleanupWheel = cleanup;
    });

    return () => {
      disposed = true;
      cleanupWheel?.();
      resizeObserver?.disconnect();
      if (app?.canvas.parentElement === host) {
        host.removeChild(app.canvas);
      }
      app?.destroy(true, { children: true });
    };
  }, [world, mapMode, selectedProvinceId, onSelectProvince]);

  return (
    <div className="worldMap" ref={hostRef}>
      <div className="mapHint">Drag to pan / Wheel to zoom / {Math.round(zoom * 100)}%</div>
    </div>
  );
}

function drawWorld(
  container: Container,
  world: World,
  mapMode: MapMode,
  selectedProvinceId: string | undefined,
  tileByCoord: Map<string, Tile>,
) {
  const terrain = new Graphics();
  const ownership = new Graphics();
  const resources = new Graphics();
  const provinceBorders = new Graphics();
  const nationBorderGlow = new Graphics();
  const nationBorders = new Graphics();
  const selectedProvince = new Graphics();
  const nationLabels = new Container();

  for (const tile of world.tiles) {
    const x = tile.x * TILE_SIZE;
    const y = tile.y * TILE_SIZE;
    terrain.rect(x, y, TILE_SIZE, TILE_SIZE).fill(terrainColors[tile.terrain]);

    if (tile.provinceId) {
      const province = world.provinceById.get(tile.provinceId);
      if (!province) {
        continue;
      }

      const nation = world.nationById.get(province.nationId);
      if (nation && mapMode === "political") {
        ownership
          .rect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2)
          .fill({ color: nation.numericColor, alpha: 0.48 });
      }
    }

    if (tile.resource && mapMode !== "terrain") {
      const radius = mapMode === "resources" ? 4.4 : 2.8;
      const strokeWidth = mapMode === "resources" ? 1.4 : 0.9;
      const strokeAlpha = mapMode === "resources" ? 0.95 : 0.72;
      resources
        .circle(x + TILE_SIZE * 0.72, y + TILE_SIZE * 0.28, radius)
        .fill(resourceColors[tile.resource])
        .stroke({ color: 0xffffff, width: strokeWidth, alpha: strokeAlpha });
    }
  }

  drawDashedEdges(provinceBorders, world.provinceEdges, 0xe8f2dc, 0.95, 4, 3, 0.58);
  drawNationEdges(nationBorderGlow, world.nationEdges, world, 4.4, 0.84);
  drawSolidEdges(nationBorders, world.nationEdges, 0xf8fbf1, 1.65, 0.94);
  drawSelectedProvince(selectedProvince, selectedProvinceId, tileByCoord);
  drawNationLabels(nationLabels, world);

  container.addChild(
    terrain,
    ownership,
    resources,
    provinceBorders,
    nationBorderGlow,
    nationBorders,
    selectedProvince,
    nationLabels,
  );
}

function drawNationEdges(
  graphics: Graphics,
  edges: MapEdge[],
  world: World,
  width: number,
  alpha: number,
) {
  for (const edge of edges) {
    const nation = edge.nationId ? world.nationById.get(edge.nationId) : undefined;
    graphics
      .moveTo(edge.x1 * TILE_SIZE, edge.y1 * TILE_SIZE)
      .lineTo(edge.x2 * TILE_SIZE, edge.y2 * TILE_SIZE)
      .stroke({ color: nation?.numericColor ?? 0xf8fbf1, width, alpha });
  }
}

function drawSolidEdges(
  graphics: Graphics,
  edges: MapEdge[],
  color: number,
  width: number,
  alpha: number,
) {
  for (const edge of edges) {
    graphics
      .moveTo(edge.x1 * TILE_SIZE, edge.y1 * TILE_SIZE)
      .lineTo(edge.x2 * TILE_SIZE, edge.y2 * TILE_SIZE)
      .stroke({ color, width, alpha });
  }
}

function drawDashedEdges(
  graphics: Graphics,
  edges: MapEdge[],
  color: number,
  width: number,
  dashLength: number,
  gapLength: number,
  alpha: number,
) {
  for (const edge of edges) {
    const x1 = edge.x1 * TILE_SIZE;
    const y1 = edge.y1 * TILE_SIZE;
    const x2 = edge.x2 * TILE_SIZE;
    const y2 = edge.y2 * TILE_SIZE;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const stepX = dx / length;
    const stepY = dy / length;

    for (let offset = 0; offset < length; offset += dashLength + gapLength) {
      const segmentEnd = Math.min(offset + dashLength, length);
      graphics
        .moveTo(x1 + stepX * offset, y1 + stepY * offset)
        .lineTo(x1 + stepX * segmentEnd, y1 + stepY * segmentEnd)
        .stroke({ color, width, alpha });
    }
  }
}

function drawSelectedProvince(
  graphics: Graphics,
  provinceId: string | undefined,
  tileByCoord: Map<string, Tile>,
) {
  if (!provinceId) {
    return;
  }

  for (const tile of tileByCoord.values()) {
    if (tile.provinceId !== provinceId) {
      continue;
    }

    const x = tile.x * TILE_SIZE;
    const y = tile.y * TILE_SIZE;
    graphics.rect(x, y, TILE_SIZE, TILE_SIZE).fill({ color: 0xffffff, alpha: 0.2 });

    const neighbors = [
      { dx: 0, dy: -1, edge: { x1: tile.x, y1: tile.y, x2: tile.x + 1, y2: tile.y } },
      { dx: 1, dy: 0, edge: { x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 } },
      { dx: 0, dy: 1, edge: { x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 } },
      { dx: -1, dy: 0, edge: { x1: tile.x, y1: tile.y, x2: tile.x, y2: tile.y + 1 } },
    ];

    for (const neighbor of neighbors) {
      const adjacent = tileByCoord.get(`${tile.x + neighbor.dx},${tile.y + neighbor.dy}`);
      if (adjacent?.provinceId !== provinceId) {
        graphics
          .moveTo(neighbor.edge.x1 * TILE_SIZE, neighbor.edge.y1 * TILE_SIZE)
          .lineTo(neighbor.edge.x2 * TILE_SIZE, neighbor.edge.y2 * TILE_SIZE)
          .stroke({ color: 0xffffff, width: 2.6, alpha: 0.96 });
      }
    }
  }
}

function drawNationLabels(container: Container, world: World) {
  for (const nation of world.nations) {
    const capital = world.provinceById.get(nation.capitalProvinceId);
    if (!capital) {
      continue;
    }

    const label = new Text({
      text: nation.name,
      style: {
        fill: 0xf8fbf1,
        fontFamily: "Arial",
        fontSize: 15,
        fontWeight: "700",
        stroke: { color: 0x10161b, width: 4 },
      },
    });

    label.position.set(capital.centerX * TILE_SIZE, capital.centerY * TILE_SIZE);
    container.addChild(label);
  }
}

function centerWorld(app: Application, viewport: Container, world: World) {
  const mapWidth = world.width * TILE_SIZE;
  const mapHeight = world.height * TILE_SIZE;
  const scale = Math.min(
    1.15,
    Math.max(MIN_SCALE, Math.min(app.screen.width / mapWidth, app.screen.height / mapHeight) * 0.92),
  );

  viewport.scale.set(scale);
  viewport.position.set(
    (app.screen.width - mapWidth * scale) / 2,
    (app.screen.height - mapHeight * scale) / 2,
  );

  return scale;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}
