import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { formatResourceName, getTileMonthlyYield } from "../world/economy";
import type { MapEdge, Tile, World } from "../world/types";
import type { ArmyGroup } from "../world/war";

export type MapMode = "political" | "terrain" | "resources";

type WorldMapProps = {
  world: World;
  mapMode: MapMode;
  mapRevision: number;
  armyGroups: ArmyGroup[];
  selectedCityId?: string;
  selectedProvinceId?: string;
  onSelectCity: (cityId: string) => void;
  onSelectProvince: (provinceId: string | undefined) => void;
};

type ResourceTooltip = {
  x: number;
  y: number;
  label: string;
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

export function WorldMap({
  armyGroups,
  mapRevision,
  world,
  mapMode,
  onSelectCity,
  onSelectProvince,
  selectedCityId,
  selectedProvinceId,
}: WorldMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const armyGraphicsRef = useRef<Graphics | null>(null);
  const armyLabelsRef = useRef<Container | null>(null);
  const armyPathsRef = useRef<Graphics | null>(null);
  const selectedLayerRef = useRef<Graphics | null>(null);
  const tileByCoord = useMemo(
    () => new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
    [world],
  );
  const [zoom, setZoom] = useState(1);
  const [resourceTooltip, setResourceTooltip] = useState<ResourceTooltip | undefined>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    let resizeFrame = 0;
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
      syncRendererSize(pixiApp, host);

      const viewport = new Container();
      pixiApp.stage.addChild(viewport);

      drawWorld(viewport, world, mapMode, tileByCoord);
      const armyPaths = new Graphics();
      const armies = new Graphics();
      const armyLabels = new Container();
      armyPathsRef.current = armyPaths;
      armyGraphicsRef.current = armies;
      armyLabelsRef.current = armyLabels;
      viewport.addChild(armyPaths, armies, armyLabels);
      if (mapMode === "political") {
        drawArmyGroups(armies, armyPaths, armyLabels, world, armyGroups);
      }
      const selectedLayer = new Graphics();
      selectedLayerRef.current = selectedLayer;
      viewport.addChild(selectedLayer);
      drawSelectedProvince(selectedLayer, selectedProvinceId, tileByCoord);
      drawSelectedCity(selectedLayer, selectedCityId, world);
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
          const tooltip = getResourceTooltip(event.global, viewport, tileByCoord, mapMode);
          setResourceTooltip(tooltip);
          return;
        }

        setResourceTooltip(undefined);
        const dx = event.global.x - lastPointer.x;
        const dy = event.global.y - lastPointer.y;
        viewport.position.set(viewport.x + dx, viewport.y + dy);
        lastPointer = { x: event.global.x, y: event.global.y };
      });

      const endDrag = (event?: { global: { x: number; y: number } }) => {
        if (event && dragging && distance(dragStart.x, dragStart.y, event.global.x, event.global.y) < 4) {
          const local = viewport.toLocal(event.global);
          const cityId = mapMode === "political" ? cityAtPoint(local.x, local.y, world) : undefined;
          if (cityId) {
            onSelectCity(cityId);
            dragging = false;
            return;
          }

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

      const handleMouseLeave = () => setResourceTooltip(undefined);

      pixiApp.canvas.addEventListener("wheel", handleWheel, { passive: false });
      pixiApp.canvas.addEventListener("mouseleave", handleMouseLeave);

      resizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          syncRendererSize(pixiApp, host);
          pixiApp.stage.hitArea = pixiApp.screen;
        });
      });
      resizeObserver.observe(host);

      return () => {
        pixiApp.canvas.removeEventListener("wheel", handleWheel);
        pixiApp.canvas.removeEventListener("mouseleave", handleMouseLeave);
      };
    };

    let cleanupWheel: (() => void) | undefined;
    setup().then((cleanup) => {
      cleanupWheel = cleanup;
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(resizeFrame);
      cleanupWheel?.();
      resizeObserver?.disconnect();
      armyGraphicsRef.current = null;
      armyLabelsRef.current = null;
      armyPathsRef.current = null;
      selectedLayerRef.current = null;
      if (app?.canvas.parentElement === host) {
        host.removeChild(app.canvas);
      }
      app?.destroy(true, { children: true });
    };
  }, [world, mapMode, mapRevision, onSelectCity, onSelectProvince, tileByCoord]);

  useEffect(() => {
    const armies = armyGraphicsRef.current;
    const armyPaths = armyPathsRef.current;
    const armyLabels = armyLabelsRef.current;
    if (!armies || !armyPaths || !armyLabels) {
      return;
    }

    armies.clear();
    armyPaths.clear();
    armyLabels.removeChildren();
    if (mapMode === "political") {
      drawArmyGroups(armies, armyPaths, armyLabels, world, armyGroups);
    }
  }, [armyGroups, mapMode, world]);

  useEffect(() => {
    const selectedLayer = selectedLayerRef.current;
    if (!selectedLayer) {
      return;
    }

    selectedLayer.clear();
    drawSelectedProvince(selectedLayer, selectedProvinceId, tileByCoord);
    drawSelectedCity(selectedLayer, selectedCityId, world);
  }, [selectedCityId, selectedProvinceId, tileByCoord, world]);

  return (
    <div className="worldMap" ref={hostRef}>
      <div className="mapHint">Drag to pan / Wheel to zoom / {Math.round(zoom * 100)}%</div>
      {resourceTooltip && (
        <div className="resourceTooltip" style={{ left: resourceTooltip.x, top: resourceTooltip.y }}>
          {resourceTooltip.label}
        </div>
      )}
    </div>
  );
}

function getResourceTooltip(
  globalPoint: { x: number; y: number },
  viewport: Container,
  tileByCoord: Map<string, Tile>,
  mapMode: MapMode,
): ResourceTooltip | undefined {
  if (mapMode !== "resources") {
    return undefined;
  }

  const local = viewport.toLocal(globalPoint);
  const tileX = Math.floor(local.x / TILE_SIZE);
  const tileY = Math.floor(local.y / TILE_SIZE);
  const tile = tileByCoord.get(`${tileX},${tileY}`);
  const yieldValue = tile ? getTileMonthlyYield(tile) : undefined;

  if (!tile || !yieldValue) {
    return undefined;
  }

  const resourcePoint = {
    x: tileX * TILE_SIZE + TILE_SIZE * 0.72,
    y: tileY * TILE_SIZE + TILE_SIZE * 0.28,
  };
  const distanceToResource = distance(local.x, local.y, resourcePoint.x, resourcePoint.y);
  const hitRadius = mapMode === "resources" ? 7.5 : 5;

  if (distanceToResource > hitRadius) {
    return undefined;
  }

  return {
    x: globalPoint.x + 12,
    y: Math.max(12, globalPoint.y - 36),
    label: `${formatResourceName(yieldValue.resource)} +${yieldValue.amount}/month`,
  };
}

function drawWorld(
  container: Container,
  world: World,
  mapMode: MapMode,
  tileByCoord: Map<string, Tile>,
) {
  const terrain = new Graphics();
  const ownership = new Graphics();
  const resources = new Graphics();
  const provinceBorders = new Graphics();
  const nationBorderGlow = new Graphics();
  const nationBorders = new Graphics();
  const cities = new Graphics();
  const cityLabels = new Container();
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

    if (tile.resource && mapMode === "resources") {
      const radius = 4.4;
      const strokeWidth = 1.4;
      const strokeAlpha = 0.95;
      resources
        .circle(x + TILE_SIZE * 0.72, y + TILE_SIZE * 0.28, radius)
        .fill(resourceColors[tile.resource])
        .stroke({ color: 0xffffff, width: strokeWidth, alpha: strokeAlpha });
    }
  }

  drawDashedEdges(provinceBorders, world.provinceEdges, 0xe8f2dc, 0.95, 4, 3, 0.58);
  drawNationEdges(nationBorderGlow, world.nationEdges, world, 4.4, 0.84);
  drawSolidEdges(nationBorders, world.nationEdges, 0xf8fbf1, 1.65, 0.94);
  if (mapMode === "political") {
    drawCities(cities, cityLabels, world);
  }
  drawNationLabels(nationLabels, world);

  container.addChild(
    terrain,
    ownership,
    resources,
    provinceBorders,
    nationBorderGlow,
    nationBorders,
    cities,
    cityLabels,
    nationLabels,
  );
}

function syncRendererSize(app: Application, host: HTMLElement) {
  const width = Math.max(1, Math.floor(host.clientWidth));
  const height = Math.max(1, Math.floor(host.clientHeight));

  if (app.screen.width !== width || app.screen.height !== height) {
    app.renderer.resize(width, height);
  }

  app.stage.hitArea = app.screen;
}

function cityAtPoint(x: number, y: number, world: World) {
  let nearestCityId: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of world.cities) {
    const cityX = city.x * TILE_SIZE + TILE_SIZE / 2;
    const cityY = city.y * TILE_SIZE + TILE_SIZE / 2;
    const hitRadius = city.isCapital ? 10 : 7;
    const cityDistance = distance(x, y, cityX, cityY);

    if (cityDistance <= hitRadius && cityDistance < nearestDistance) {
      nearestCityId = city.id;
      nearestDistance = cityDistance;
    }
  }

  return nearestCityId;
}

function drawCities(graphics: Graphics, labels: Container, world: World) {
  for (const city of world.cities) {
    const nation = world.nationById.get(city.nationId);
    const x = city.x * TILE_SIZE + TILE_SIZE / 2;
    const y = city.y * TILE_SIZE + TILE_SIZE / 2;

    if (city.isCapital) {
      graphics
        .circle(x, y, 6.2)
        .fill({ color: 0xf8fbf1, alpha: 0.96 })
        .stroke({ color: nation?.numericColor ?? 0xf8fbf1, width: 2.8, alpha: 1 });
      graphics.circle(x, y, 2.2).fill(nation?.numericColor ?? 0x10161b);

      labels.addChild(createCityLabel(city.name, x + 7, y + 5, 11, 3));
      continue;
    }

    graphics
      .circle(x, y, 3.6)
      .fill({ color: 0xf8fbf1, alpha: 0.9 })
      .stroke({ color: nation?.numericColor ?? 0xf8fbf1, width: 1.8, alpha: 0.95 });
    labels.addChild(createCityLabel(city.name, x + 5, y - 12, 9, 2.4));
  }
}

function drawArmyGroups(
  graphics: Graphics,
  paths: Graphics,
  labels: Container,
  world: World,
  armyGroups: ArmyGroup[],
) {
  const groupsByProvince = new Map<string, ArmyGroup[]>();

  for (const group of armyGroups) {
    if (totalArmyGroupUnits(group) <= 0) {
      continue;
    }
    const provinceGroups = groupsByProvince.get(group.locationProvinceId) ?? [];
    provinceGroups.push(group);
    groupsByProvince.set(group.locationProvinceId, provinceGroups);
  }

  for (const group of armyGroups) {
    const province = world.provinceById.get(group.locationProvinceId);
    const nation = world.nationById.get(group.nationId);
    if (!province || !nation || group.pathProvinceIds.length === 0) {
      continue;
    }

    let lastX = province.centerX * TILE_SIZE;
    let lastY = province.centerY * TILE_SIZE;
    for (const pathProvinceId of group.pathProvinceIds.slice(0, 5)) {
      const pathProvince = world.provinceById.get(pathProvinceId);
      if (!pathProvince) {
        continue;
      }
      const nextX = pathProvince.centerX * TILE_SIZE;
      const nextY = pathProvince.centerY * TILE_SIZE;
      paths
        .moveTo(lastX, lastY)
        .lineTo(nextX, nextY)
        .stroke({ color: nation.numericColor, width: 1.25, alpha: 0.42 });
      lastX = nextX;
      lastY = nextY;
    }
  }

  for (const [provinceId, provinceGroups] of groupsByProvince) {
    const province = world.provinceById.get(provinceId);
    if (!province) {
      continue;
    }

    provinceGroups.forEach((group, index) => {
      const nation = world.nationById.get(group.nationId);
      const x = province.centerX * TILE_SIZE + (index % 3) * 9 - 9;
      const y = province.centerY * TILE_SIZE + Math.floor(index / 3) * 8 - 5;
      const color = nation?.numericColor ?? 0xf8fbf1;
      const radius = group.stance === "attack" ? 5.8 : 5;

      if (group.stance === "attack" || group.stance === "raid") {
        graphics
          .regularPoly(x, y, radius, 3, -Math.PI / 2)
          .fill({ color, alpha: 0.96 })
          .stroke({ color: 0xf8fbf1, width: 1.4, alpha: 0.94 });
      } else {
        graphics
          .circle(x, y, radius)
          .fill({ color, alpha: 0.95 })
          .stroke({ color: 0xf8fbf1, width: 1.4, alpha: 0.94 });
      }

      labels.addChild(createCityLabel(shortArmyLabel(totalArmyGroupUnits(group)), x + 5, y + 4, 8, 2));
    });
  }
}

function totalArmyGroupUnits(group: ArmyGroup) {
  return Object.values(group.units).reduce((sum, amount) => sum + amount, 0);
}

function shortArmyLabel(total: number) {
  if (total >= 1000) {
    return `${Math.round(total / 100) / 10}K`;
  }

  return String(total);
}

function createCityLabel(
  name: string,
  x: number,
  y: number,
  fontSize: number,
  strokeWidth: number,
) {
  const label = new Text({
    text: name,
    style: {
      fill: 0xf8fbf1,
      fontFamily: "Arial",
      fontSize,
      fontWeight: "700",
      stroke: { color: 0x10161b, width: strokeWidth },
    },
  });

  label.position.set(x, y);
  return label;
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
    const capitalCity = nation.capitalCityId ? world.cityById.get(nation.capitalCityId) : undefined;
    const capitalProvince = world.provinceById.get(nation.capitalProvinceId);
    const x = capitalCity?.x ?? capitalProvince?.centerX;
    const y = capitalCity?.y ?? capitalProvince?.centerY;
    if (x === undefined || y === undefined) {
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

    label.position.set(x * TILE_SIZE + TILE_SIZE * 0.7, y * TILE_SIZE - TILE_SIZE * 0.9);
    container.addChild(label);
  }
}

function drawSelectedCity(graphics: Graphics, cityId: string | undefined, world: World) {
  if (!cityId) {
    return;
  }

  const city = world.cityById.get(cityId);
  if (!city) {
    return;
  }

  const x = city.x * TILE_SIZE + TILE_SIZE / 2;
  const y = city.y * TILE_SIZE + TILE_SIZE / 2;

  graphics
    .circle(x, y, city.isCapital ? 10.5 : 8)
    .stroke({ color: 0xffffff, width: 2.4, alpha: 0.98 });
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
