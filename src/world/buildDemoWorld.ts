import type { MapEdge, Nation, Province, Resource, Terrain, Tile, World } from "./types";

const width = 36;
const height = 24;
const provinceSize = 4;

const nations: Nation[] = [
  { id: "aurora", name: "Aurora Directorate", color: "#4d8bff", numericColor: 0x4d8bff },
  { id: "verdant", name: "Verdant Assembly", color: "#42a66b", numericColor: 0x42a66b },
  { id: "sol", name: "Sol Meridian", color: "#d89d35", numericColor: 0xd89d35 },
  { id: "ember", name: "Ember Compact", color: "#d4615f", numericColor: 0xd4615f },
];

const nationLayout = [
  ["aurora", "aurora", "verdant", "verdant", "verdant", "verdant", "sol", "sol", "sol"],
  ["aurora", "aurora", "aurora", "verdant", "verdant", "sol", "sol", "sol", "sol"],
  ["aurora", "aurora", "aurora", "verdant", "sol", "sol", "sol", "ember", "ember"],
  ["aurora", "aurora", "verdant", "verdant", "sol", "ember", "ember", "ember", "ember"],
  ["aurora", "verdant", "verdant", "sol", "sol", "ember", "ember", "ember", "ember"],
  ["verdant", "verdant", "verdant", "sol", "ember", "ember", "ember", "ember", "ember"],
];

const provinceNames = [
  "Northreach",
  "Glasswater",
  "Iron Vale",
  "Windplain",
  "Moonfen",
  "Redbarrow",
  "Sunfall",
  "Highmere",
  "Eastwatch",
  "Silver Coast",
  "Old Timber",
  "Amber Steppe",
  "Cloudridge",
  "Pearl Basin",
  "Ashfield",
  "Dawn Gate",
  "Low March",
  "Storm Ford",
  "River Crown",
  "Saltmere",
  "Thornhold",
  "Starfield",
  "Bright Moor",
  "Copper Reach",
  "Frostmere",
  "Southgate",
  "New Orchard",
  "Flint Coast",
  "Pine Belt",
  "Golden Rise",
  "Sable Plain",
  "Marble Run",
  "Grey Downs",
  "Firebreak",
  "Hearth Basin",
  "Last Harbour",
  "Bluefall",
  "Quiet Range",
  "Stonewake",
  "Mistfield",
  "Cinder Wash",
  "Lakewall",
  "Far Garden",
  "Bright Harbor",
  "Needle Hills",
  "Orchid Span",
  "Nightwell",
  "Westforge",
  "Deep Fen",
  "Hollow Steppe",
  "Green Pass",
  "Long Valley",
  "Clearwater",
  "Crown Shoal",
];

export function buildDemoWorld(): World {
  const provinces = buildProvinces();
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const nationById = new Map(nations.map((nation) => [nation.id, nation]));
  const tiles = buildTiles();
  const { provinceEdges, nationEdges } = buildBorders(tiles, provinceById);

  return {
    width,
    height,
    tiles,
    nations,
    provinces,
    provinceById,
    nationById,
    provinceEdges,
    nationEdges,
  };
}

function buildProvinces(): Province[] {
  const provinces: Province[] = [];
  let index = 0;

  for (let py = 0; py < height / provinceSize; py += 1) {
    for (let px = 0; px < width / provinceSize; px += 1) {
      const id = provinceId(px, py);
      provinces.push({
        id,
        name: provinceNames[index] ?? `Province ${index + 1}`,
        nationId: nationLayout[py][px],
      });
      index += 1;
    }
  }

  return provinces;
}

function buildTiles(): Tile[] {
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = Math.floor(x / provinceSize);
      const py = Math.floor(y / provinceSize);
      tiles.push({
        x,
        y,
        terrain: terrainAt(x, y),
        provinceId: provinceId(px, py),
        resource: resourceAt(x, y),
      });
    }
  }

  return tiles;
}

function buildBorders(
  tiles: Tile[],
  provinceById: Map<string, Province>,
): { provinceEdges: MapEdge[]; nationEdges: MapEdge[] } {
  const tileByCoord = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const provinceEdges: MapEdge[] = [];
  const nationEdges: MapEdge[] = [];

  for (const tile of tiles) {
    const right = tileByCoord.get(`${tile.x + 1},${tile.y}`);
    const down = tileByCoord.get(`${tile.x},${tile.y + 1}`);

    if (right && right.provinceId !== tile.provinceId) {
      provinceEdges.push({ x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 });
      if (sameNation(tile.provinceId, right.provinceId, provinceById) === false) {
        nationEdges.push({ x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 });
      }
    }

    if (down && down.provinceId !== tile.provinceId) {
      provinceEdges.push({ x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 });
      if (sameNation(tile.provinceId, down.provinceId, provinceById) === false) {
        nationEdges.push({ x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 });
      }
    }

    if (tile.x === 0) {
      provinceEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x, y2: tile.y + 1 });
      nationEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x, y2: tile.y + 1 });
    }

    if (tile.y === 0) {
      provinceEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x + 1, y2: tile.y });
      nationEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x + 1, y2: tile.y });
    }

    if (tile.x === width - 1) {
      provinceEdges.push({ x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 });
      nationEdges.push({ x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 });
    }

    if (tile.y === height - 1) {
      provinceEdges.push({ x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 });
      nationEdges.push({ x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 });
    }
  }

  return { provinceEdges, nationEdges };
}

function sameNation(
  provinceA: string,
  provinceB: string,
  provinceById: Map<string, Province>,
) {
  return provinceById.get(provinceA)?.nationId === provinceById.get(provinceB)?.nationId;
}

function terrainAt(x: number, y: number): Terrain {
  const nx = x / width;
  const ny = y / height;
  const elevation =
    Math.sin(x * 0.42) * 0.28 +
    Math.cos(y * 0.36) * 0.23 +
    Math.sin((x + y) * 0.18) * 0.21 +
    0.5;
  const moisture = Math.cos(x * 0.21 - y * 0.3) * 0.5 + 0.5;
  const latitude = Math.abs(ny - 0.5) * 2;

  if (nx < 0.05 || ny < 0.06 || nx > 0.95 || ny > 0.94) {
    return "coast";
  }

  if (elevation > 1.08) {
    return "mountain";
  }

  if (elevation > 0.9) {
    return "hill";
  }

  if (moisture > 0.72 && latitude < 0.82) {
    return "forest";
  }

  if (moisture < 0.18 && latitude < 0.7) {
    return "desert";
  }

  return "plain";
}

function resourceAt(x: number, y: number): Resource | undefined {
  const key = (x * 31 + y * 47 + x * y * 7) % 37;
  const terrain = terrainAt(x, y);

  if (key === 0 && terrain === "plain") {
    return "grain";
  }

  if (key === 2 && terrain === "forest") {
    return "timber";
  }

  if (key === 4 && (terrain === "hill" || terrain === "mountain")) {
    return "iron";
  }

  if (key === 7 && terrain === "hill") {
    return "coal";
  }

  if (key === 10 && terrain === "coast") {
    return "oil";
  }

  return undefined;
}

function provinceId(px: number, py: number) {
  return `province-${py}-${px}`;
}
