import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { MapEdge, World } from "../world/types";

type WorldMapProps = {
  world: World;
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

export function WorldMap({ world }: WorldMapProps) {
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

      drawWorld(viewport, world);
      setZoom(centerWorld(pixiApp, viewport, world));

      let dragging = false;
      let lastPointer = { x: 0, y: 0 };

      pixiApp.stage.eventMode = "static";
      pixiApp.stage.hitArea = pixiApp.screen;

      pixiApp.stage.on("pointerdown", (event) => {
        dragging = true;
        lastPointer = { x: event.global.x, y: event.global.y };
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

      const endDrag = () => {
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
  }, [world]);

  return (
    <div className="worldMap" ref={hostRef}>
      <div className="mapHint">Drag to pan / Wheel to zoom / {Math.round(zoom * 100)}%</div>
    </div>
  );
}

function drawWorld(container: Container, world: World) {
  const terrain = new Graphics();
  const ownership = new Graphics();
  const resources = new Graphics();
  const provinceBorders = new Graphics();
  const nationBorders = new Graphics();

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
      if (nation) {
        ownership
          .rect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2)
          .fill({ color: nation.numericColor, alpha: 0.32 });
      }
    }

    if (tile.resource) {
      resources
        .circle(x + TILE_SIZE * 0.72, y + TILE_SIZE * 0.28, 2.8)
        .fill(resourceColors[tile.resource])
        .stroke({ color: 0xffffff, width: 0.9, alpha: 0.72 });
    }
  }

  drawDashedEdges(provinceBorders, world.provinceEdges, 0xe8f2dc, 0.95, 4, 3, 0.58);
  drawSolidEdges(nationBorders, world.nationEdges, 0xf8fbf1, 2.4, 0.92);

  container.addChild(terrain, ownership, resources, provinceBorders, nationBorders);
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
