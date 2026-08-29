import type { City, MapEdge, Nation, Province, Resource, Terrain, Tile, World } from "./types";
import { resourceTypes } from "./economy";
import { cityNames, governmentForms, nationNameBases } from "./nameCatalog";

const width = 96;
const height = 64;
const defaultSeed = "observer-world-001";
const defaultNationCount = 6;
const targetProvinceCount = 118;

/** 新世界创建时可以调整的生成参数。 */
export type WorldGenerationOptions = {
  cityCount?: number;
  nationCount?: number;
};

const nationColors = [
  { color: "#4d8bff", numericColor: 0x4d8bff },
  { color: "#42a66b", numericColor: 0x42a66b },
  { color: "#d89d35", numericColor: 0xd89d35 },
  { color: "#d4615f", numericColor: 0xd4615f },
  { color: "#b985e8", numericColor: 0xb985e8 },
  { color: "#49b7c9", numericColor: 0x49b7c9 },
  { color: "#e36fbc", numericColor: 0xe36fbc },
  { color: "#8ea848", numericColor: 0x8ea848 },
  { color: "#e27c36", numericColor: 0xe27c36 },
  { color: "#6b79d6", numericColor: 0x6b79d6 },
  { color: "#39a89d", numericColor: 0x39a89d },
  { color: "#b56245", numericColor: 0xb56245 },
];
const nationIds = ["aurora", "verdant", "sol", "ember", "lumen", "cobalt"];

const namePrefixes = [
  "North",
  "South",
  "East",
  "West",
  "High",
  "Low",
  "Old",
  "New",
  "Red",
  "Blue",
  "Silver",
  "Golden",
  "Green",
  "Black",
  "White",
  "Clear",
  "Bright",
  "Deep",
  "Storm",
  "Cloud",
  "Star",
  "Moon",
  "Sun",
  "Stone",
];

const nameRoots = [
  "reach",
  "mere",
  "vale",
  "plain",
  "wood",
  "ford",
  "ridge",
  "basin",
  "march",
  "watch",
  "harbor",
  "field",
  "coast",
  "gate",
  "fen",
  "fall",
  "run",
  "moor",
  "hold",
  "pass",
  "crown",
  "barrow",
  "garden",
  "forge",
];

type ProvinceSeed = {
  id: string;
  x: number;
  y: number;
};

/** 按种子和可选规模参数生成一个完整世界。 */
export function buildDemoWorld(seed = defaultSeed, options: WorldGenerationOptions = {}): World {
  const seedHash = hashString(seed);
  const rng = mulberry32(seedHash);
  const requestedNationCount = clampInt(options.nationCount ?? defaultNationCount, 2, 12);
  const tiles = buildTiles(seedHash);
  const provinceSeeds = chooseProvinceSeeds(tiles, rng);
  const provinces = buildProvinces(tiles, provinceSeeds, seedHash);
  const capitals = chooseCapitalProvinces(provinces, rng, requestedNationCount);
  const nations = buildNations(capitals, rng);
  assignNationsToProvinces(provinces, capitals, nations, seedHash);
  ensureNationResourceCoverage(tiles, provinces, nations, seedHash);

  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const nationById = new Map(nations.map((nation) => [nation.id, nation]));
  const { provinceEdges, nationEdges } = buildBorders(tiles, provinceById);
  const cities = buildCities(tiles, provinces, nations, seedHash, options.cityCount);
  const cityById = new Map(cities.map((city) => [city.id, city]));

  return {
    seed,
    width,
    height,
    tiles,
    nations,
    provinces,
    cities,
    provinceById,
    nationById,
    cityById,
    provinceEdges,
    nationEdges,
  };
}

function buildTiles(seedHash: number): Tile[] {
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sample = sampleClimate(x, y, seedHash);
      const terrain = terrainFromSample(sample);
      tiles.push({
        x,
        y,
        terrain,
        elevation: sample.elevation,
        temperature: sample.temperature,
        moisture: sample.moisture,
        resource: resourceAt(x, y, terrain, sample, seedHash),
      });
    }
  }

  return tiles;
}

function chooseProvinceSeeds(tiles: Tile[], rng: () => number): ProvinceSeed[] {
  const landTiles = tiles.filter((tile) => isLand(tile));
  const seeds: ProvinceSeed[] = [];
  const attempts = targetProvinceCount * 45;
  const minDistance = 4.2;

  for (let i = 0; i < attempts && seeds.length < targetProvinceCount; i += 1) {
    const tile = landTiles[Math.floor(rng() * landTiles.length)];
    const farEnough = seeds.every((seed) => distance(tile.x, tile.y, seed.x, seed.y) >= minDistance);

    if (farEnough) {
      seeds.push({ id: `province-${seeds.length}`, x: tile.x, y: tile.y });
    }
  }

  while (seeds.length < Math.min(landTiles.length, targetProvinceCount)) {
    const tile = landTiles[Math.floor(rng() * landTiles.length)];
    seeds.push({ id: `province-${seeds.length}`, x: tile.x, y: tile.y });
  }

  return seeds;
}

function buildProvinces(tiles: Tile[], seeds: ProvinceSeed[], seedHash: number): Province[] {
  const provinceStats = new Map<string, { xSum: number; ySum: number; count: number }>();

  for (const tile of tiles) {
    if (!isLand(tile)) {
      continue;
    }

    let bestSeed = seeds[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const seed of seeds) {
      const terrainPenalty = tile.terrain === "mountain" ? 14 : tile.terrain === "hill" ? 5 : 0;
      const borderNoise = noise2D(tile.x * 0.15 + seed.x, tile.y * 0.15 - seed.y, seedHash + 800);
      const score =
        (tile.x - seed.x) ** 2 +
        (tile.y - seed.y) ** 2 +
        terrainPenalty +
        borderNoise * 16;

      if (score < bestScore) {
        bestScore = score;
        bestSeed = seed;
      }
    }

    tile.provinceId = bestSeed.id;
    const stat = provinceStats.get(bestSeed.id) ?? { xSum: 0, ySum: 0, count: 0 };
    stat.xSum += tile.x;
    stat.ySum += tile.y;
    stat.count += 1;
    provinceStats.set(bestSeed.id, stat);
  }

  return seeds
    .map((seed, index): Province | undefined => {
      const stat = provinceStats.get(seed.id);
      if (!stat) {
        return undefined;
      }

      return {
        id: seed.id,
        name: provinceName(index),
        nameEn: provinceName(index),
        nameZh: `第${index + 1}省`,
        nationId: "",
        centerX: stat.xSum / stat.count,
        centerY: stat.ySum / stat.count,
        tileCount: stat.count,
      };
    })
    .filter((province): province is Province => province !== undefined);
}

function chooseCapitalProvinces(
  provinces: Province[],
  rng: () => number,
  requestedNationCount: number,
): Province[] {
  const capitals: Province[] = [];
  const first = provinces[Math.floor(rng() * provinces.length)];
  capitals.push(first);

  while (capitals.length < Math.min(requestedNationCount, provinces.length)) {
    let bestProvince = provinces[0];
    let bestScore = -1;

    for (const province of provinces) {
      if (capitals.includes(province)) {
        continue;
      }

      const nearestCapital = Math.min(
        ...capitals.map((capital) =>
          distance(province.centerX, province.centerY, capital.centerX, capital.centerY),
        ),
      );
      const score = nearestCapital * (0.85 + rng() * 0.3);

      if (score > bestScore) {
        bestScore = score;
        bestProvince = province;
      }
    }

    capitals.push(bestProvince);
  }

  return capitals;
}

function buildNations(capitals: Province[], rng: () => number): Nation[] {
  const availableBases = shuffled(nationNameBases, rng);
  const availableForms = shuffled(governmentForms, rng);

  return capitals.map((capital, index) => {
    const base = availableBases[index % availableBases.length];
    const form = availableForms[index % availableForms.length];
    const colors = nationColors[index % nationColors.length];
    return {
      id: nationIds[index] ?? `nation-${index}`,
      name: `${base.en} ${form.en}`,
      nameEn: `${base.en} ${form.en}`,
      nameZh: `${base.zh}${form.zh}`,
      nameBaseId: base.id,
      governmentFormId: form.id,
      ...colors,
      capitalProvinceId: capital.id,
    };
  });
}

function assignNationsToProvinces(
  provinces: Province[],
  capitals: Province[],
  nations: Nation[],
  seedHash: number,
) {
  for (const province of provinces) {
    let bestCapital = capitals[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const capital of capitals) {
      const regionalNoise = noise2D(
        province.centerX * 0.055 + capital.centerX,
        province.centerY * 0.055 - capital.centerY,
        seedHash + 1500,
      );
      const score =
        distance(province.centerX, province.centerY, capital.centerX, capital.centerY) *
          (0.88 + regionalNoise * 0.24) -
        province.tileCount * 0.015;

      if (score < bestScore) {
        bestScore = score;
        bestCapital = capital;
      }
    }

    province.nationId = nations[capitals.indexOf(bestCapital)].id;
  }
}

/** 为每个初始国家补齐全部资源类型，确保所有国家都具备基础发展条件。 */
function ensureNationResourceCoverage(
  tiles: Tile[],
  provinces: Province[],
  nations: Nation[],
  seedHash: number,
) {
  const nationIdByProvince = new Map(provinces.map((province) => [province.id, province.nationId]));

  for (const nation of nations) {
    const ownedTiles = tiles.filter(
      (tile) => tile.provinceId && nationIdByProvince.get(tile.provinceId) === nation.id,
    );
    const existing = new Set(ownedTiles.flatMap((tile) => tile.resource ? [tile.resource] : []));

    for (const resource of resourceTypes) {
      if (existing.has(resource)) {
        continue;
      }

      const target = ownedTiles
        .filter((tile) => !tile.resource)
        .sort((a, b) => resourcePlacementScore(b, resource, seedHash) - resourcePlacementScore(a, resource, seedHash))[0];
      if (target) {
        target.resource = resource;
        existing.add(resource);
      }
    }
  }
}

function resourcePlacementScore(tile: Tile, resource: Resource, seedHash: number) {
  const preferred = resource === "grain"
    ? tile.terrain === "plain"
    : resource === "timber"
      ? tile.terrain === "forest"
      : resource === "iron" || resource === "coal"
        ? tile.terrain === "hill" || tile.terrain === "mountain"
        : tile.terrain === "coast" || tile.terrain === "desert";
  return (preferred ? 10 : 0) + randomAt(tile.x, tile.y, seedHash + 6100 + resourceTypes.indexOf(resource));
}

function buildCities(
  tiles: Tile[],
  provinces: Province[],
  nations: Nation[],
  seedHash: number,
  requestedCityCount?: number,
): City[] {
  const tilesByProvince = new Map<string, Tile[]>();
  const provincesByNation = new Map<string, Province[]>();
  const cities: City[] = [];
  let cityIndex = 0;

  for (const tile of tiles) {
    if (!tile.provinceId || !isLand(tile)) {
      continue;
    }

    const provinceTiles = tilesByProvince.get(tile.provinceId) ?? [];
    provinceTiles.push(tile);
    tilesByProvince.set(tile.provinceId, provinceTiles);
  }

  for (const province of provinces) {
    const nationProvinces = provincesByNation.get(province.nationId) ?? [];
    nationProvinces.push(province);
    provincesByNation.set(province.nationId, nationProvinces);
  }

  const remainingProvincesByNation = new Map<string, Province[]>();
  for (const nation of nations) {
    const ownedProvinces = provincesByNation.get(nation.id) ?? [];
    if (ownedProvinces.length === 0) {
      continue;
    }

    const ownedTiles = ownedProvinces.flatMap((province) => tilesByProvince.get(province.id) ?? []);
    const capitalProvince =
      ownedProvinces.find((province) => province.id === nation.capitalProvinceId) ??
      ownedProvinces[0];
    const capitalTile = chooseCityTile(
      capitalProvince,
      tilesByProvince.get(capitalProvince.id) ?? [],
      cities,
      seedHash,
      cityIndex,
    );
    const capitalCity = createCity(nation, capitalProvince, capitalTile, cityIndex, true, seedHash);

    cities.push(capitalCity);
    nation.capitalCityId = capitalCity.id;
    cityIndex += 1;

    const remainingProvinces = ownedProvinces
      .filter((province) => province.id !== capitalProvince.id)
      .sort((a, b) => b.tileCount - a.tileCount);
    remainingProvincesByNation.set(nation.id, remainingProvinces);

    if (requestedCityCount === undefined) {
      const resourceSiteCount = ownedTiles.filter((tile) => tile.resource).length;
      const targetCityCount = clampInt(
        1 + Math.floor(ownedProvinces.length / 6) + Math.floor(resourceSiteCount / 28),
        1,
        9,
      );

      while (cities.filter((city) => city.nationId === nation.id).length < targetCityCount) {
        if (remainingProvinces.length === 0) break;
        const province = addCityForNation(
          nation,
          remainingProvinces,
          tilesByProvince,
          cities,
          seedHash,
          cityIndex,
        );
        remainingProvinces.splice(remainingProvinces.indexOf(province), 1);
        cityIndex += 1;
      }
    }
  }

  if (requestedCityCount !== undefined) {
    const targetCityCount = clampInt(requestedCityCount, nations.length, provinces.length);
    while (cities.length < targetCityCount) {
      const availableNations = nations
        .filter((nation) => (remainingProvincesByNation.get(nation.id)?.length ?? 0) > 0)
        .sort((a, b) => countNationCities(cities, a.id) - countNationCities(cities, b.id));
      const nation = availableNations[0];
      if (!nation) break;
      const remainingProvinces = remainingProvincesByNation.get(nation.id) ?? [];
      const province = addCityForNation(
        nation,
        remainingProvinces,
        tilesByProvince,
        cities,
        seedHash,
        cityIndex,
      );
      remainingProvinces.splice(remainingProvinces.indexOf(province), 1);
      cityIndex += 1;
    }
  }

  return cities;
}

function addCityForNation(
  nation: Nation,
  remainingProvinces: Province[],
  tilesByProvince: Map<string, Tile[]>,
  cities: City[],
  seedHash: number,
  cityIndex: number,
): Province {
  const province = chooseCityProvince(
    remainingProvinces,
    tilesByProvince,
    cities,
    seedHash,
    cityIndex,
  );
  const tile = chooseCityTile(
    province,
    tilesByProvince.get(province.id) ?? [],
    cities,
    seedHash,
    cityIndex,
  );

  cities.push(createCity(nation, province, tile, cityIndex, false, seedHash));
  return province;
}

function countNationCities(cities: City[], nationId: string): number {
  return cities.reduce((count, city) => count + Number(city.nationId === nationId), 0);
}

function createCity(
  nation: Nation,
  province: Province,
  tile: Tile,
  index: number,
  isCapital: boolean,
  seedHash: number,
): City {
  const terrainLevelBonus = tile.terrain === "plain" || tile.terrain === "coast" ? 1 : 0;
  const resourceLevelBonus = tile.resource ? 1 : 0;
  const level = clampInt((isCapital ? 3 : 1) + terrainLevelBonus + resourceLevelBonus, 1, 5);
  const populationBase = isCapital ? 92000 : 28000;
  const populationNoise = 0.78 + randomAt(tile.x, tile.y, seedHash + 5200) * 0.55;

  return {
    id: `city-${index}`,
    ...cityName(index, seedHash),
    nationId: nation.id,
    provinceId: province.id,
    x: tile.x,
    y: tile.y,
    isCapital,
    population: Math.round(populationBase * level * populationNoise),
    level,
  };
}

function chooseCityProvince(
  provinces: Province[],
  tilesByProvince: Map<string, Tile[]>,
  existingCities: City[],
  seedHash: number,
  cityIndex: number,
) {
  let bestProvince = provinces[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const province of provinces) {
    const provinceTiles = tilesByProvince.get(province.id) ?? [];
    const resourceSites = provinceTiles.filter((tile) => tile.resource).length;
    const nearestCity = Math.min(
      18,
      ...existingCities.map((city) => distance(city.x, city.y, province.centerX, province.centerY)),
    );
    const noise = randomAt(
      Math.round(province.centerX * 10),
      Math.round(province.centerY * 10),
      seedHash + 5000 + cityIndex,
    );
    const score = province.tileCount * 0.54 + resourceSites * 9 + nearestCity * 2.4 + noise * 8;

    if (score > bestScore) {
      bestScore = score;
      bestProvince = province;
    }
  }

  return bestProvince;
}

function chooseCityTile(
  province: Province,
  provinceTiles: Tile[],
  existingCities: City[],
  seedHash: number,
  cityIndex: number,
) {
  let bestTile = provinceTiles[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const tile of provinceTiles) {
    const nearestCity = Math.min(
      10,
      ...existingCities.map((city) => distance(city.x, city.y, tile.x, tile.y)),
    );
    const crowdPenalty = nearestCity < 5 ? (5 - nearestCity) * 3.8 : 0;
    const centerPenalty = distance(tile.x, tile.y, province.centerX, province.centerY) * 0.42;
    const resourceBonus = tile.resource ? 5.8 : 0;
    const noise = randomAt(tile.x, tile.y, seedHash + 5100 + cityIndex) * 4.2;
    const score =
      cityTerrainScore(tile.terrain) + resourceBonus + nearestCity * 0.55 - centerPenalty - crowdPenalty + noise;

    if (score > bestScore) {
      bestScore = score;
      bestTile = tile;
    }
  }

  return bestTile;
}

function cityTerrainScore(terrain: Terrain) {
  switch (terrain) {
    case "plain":
      return 18;
    case "coast":
      return 16;
    case "forest":
      return 12;
    case "hill":
      return 9;
    case "desert":
      return 5;
    case "mountain":
      return 2;
    case "ocean":
      return -100;
  }
}

function cityName(index: number, seedHash: number) {
  const offset = Math.floor(randomAt(0, 0, seedHash + 6200) * cityNames.length);
  const entry = cityNames[(index + offset) % cityNames.length];
  return { name: entry.en, nameEn: entry.en, nameZh: entry.zh, nameId: entry.id };
}

function shuffled<T>(values: T[], rng: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
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

    addBorderBetween(tile, right, "vertical", provinceEdges, nationEdges, provinceById);
    addBorderBetween(tile, down, "horizontal", provinceEdges, nationEdges, provinceById);

    if (tile.x === 0 && tile.provinceId) {
      nationEdges.push({
        x1: tile.x,
        y1: tile.y,
        x2: tile.x,
        y2: tile.y + 1,
        nationId: provinceById.get(tile.provinceId)?.nationId,
      });
    }

    if (tile.y === 0 && tile.provinceId) {
      nationEdges.push({
        x1: tile.x,
        y1: tile.y,
        x2: tile.x + 1,
        y2: tile.y,
        nationId: provinceById.get(tile.provinceId)?.nationId,
      });
    }

    if (tile.x === width - 1 && tile.provinceId) {
      nationEdges.push({
        x1: tile.x + 1,
        y1: tile.y,
        x2: tile.x + 1,
        y2: tile.y + 1,
        nationId: provinceById.get(tile.provinceId)?.nationId,
      });
    }

    if (tile.y === height - 1 && tile.provinceId) {
      nationEdges.push({
        x1: tile.x,
        y1: tile.y + 1,
        x2: tile.x + 1,
        y2: tile.y + 1,
        nationId: provinceById.get(tile.provinceId)?.nationId,
      });
    }
  }

  return { provinceEdges, nationEdges };
}

function addBorderBetween(
  tile: Tile,
  neighbor: Tile | undefined,
  direction: "horizontal" | "vertical",
  provinceEdges: MapEdge[],
  nationEdges: MapEdge[],
  provinceById: Map<string, Province>,
) {
  if (!neighbor) {
    return;
  }

  const edge =
    direction === "vertical"
      ? { x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 }
      : { x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 };

  if (tile.provinceId && neighbor.provinceId && tile.provinceId !== neighbor.provinceId) {
    provinceEdges.push(edge);
  }

  if (isNationBorder(tile, neighbor, provinceById)) {
    nationEdges.push({ ...edge, nationId: nationIdForEdge(tile, neighbor, provinceById) });
  }
}

function nationIdForEdge(
  tile: Tile,
  neighbor: Tile,
  provinceById: Map<string, Province>,
) {
  if (tile.provinceId) {
    return provinceById.get(tile.provinceId)?.nationId;
  }

  if (neighbor.provinceId) {
    return provinceById.get(neighbor.provinceId)?.nationId;
  }

  return undefined;
}

function isNationBorder(
  tile: Tile,
  neighbor: Tile,
  provinceById: Map<string, Province>,
) {
  if (!tile.provinceId && !neighbor.provinceId) {
    return false;
  }

  if (!tile.provinceId || !neighbor.provinceId) {
    return true;
  }

  return (
    provinceById.get(tile.provinceId)?.nationId !==
    provinceById.get(neighbor.provinceId)?.nationId
  );
}

function sampleClimate(x: number, y: number, seedHash: number) {
  const nx = x / (width - 1);
  const ny = y / (height - 1);
  const dx = Math.abs(nx - 0.5) * 2;
  const dy = Math.abs(ny - 0.5) * 2;
  const continentalShelf = 1 - (dx ** 2.5 * 0.56 + dy ** 2.2 * 0.5);
  const broadLand = fbm(x * 0.018, y * 0.018, seedHash, 4);
  const detail = fbm(x * 0.075 + 90, y * 0.075 - 30, seedHash + 37, 4);
  const ridge = Math.abs(fbm(x * 0.05 - 10, y * 0.05 + 70, seedHash + 91, 3) - 0.5) * 2;
  const elevation = clamp01(continentalShelf * 0.57 + broadLand * 0.58 + detail * 0.18 + ridge * 0.15 - 0.2);
  const latitude = Math.abs(ny - 0.5) * 2;
  const temperature = clamp01(1 - latitude * 0.82 - elevation * 0.22 + fbm(x * 0.04, y * 0.04, seedHash + 500, 3) * 0.18);
  const oceanBonus = elevation < 0.46 ? 0.18 : 0;
  const moisture = clamp01(
    fbm(x * 0.045 + 200, y * 0.045 - 100, seedHash + 900, 4) * 0.74 +
      (1 - elevation) * 0.18 +
      oceanBonus,
  );

  return { elevation, temperature, moisture };
}

function terrainFromSample(sample: ReturnType<typeof sampleClimate>): Terrain {
  if (sample.elevation < 0.39) {
    return "ocean";
  }

  if (sample.elevation < 0.45) {
    return "coast";
  }

  if (sample.elevation > 0.82) {
    return "mountain";
  }

  if (sample.elevation > 0.68) {
    return "hill";
  }

  if (sample.temperature > 0.62 && sample.moisture < 0.34) {
    return "desert";
  }

  if (sample.moisture > 0.62) {
    return "forest";
  }

  return "plain";
}

function resourceAt(
  x: number,
  y: number,
  terrain: Terrain,
  sample: ReturnType<typeof sampleClimate>,
  seedHash: number,
): Resource | undefined {
  const roll = randomAt(x, y, seedHash + 3000);

  if (terrain === "plain" && sample.moisture > 0.38 && roll < 0.08) {
    return "grain";
  }

  if (terrain === "forest" && roll < 0.07) {
    return "timber";
  }

  if ((terrain === "hill" || terrain === "mountain") && roll < 0.075) {
    return randomAt(x, y, seedHash + 3010) < 0.68 ? "iron" : "coal";
  }

  if ((terrain === "coast" || terrain === "desert") && roll < 0.035) {
    return "oil";
  }

  return undefined;
}

function provinceName(index: number) {
  const prefix = namePrefixes[index % namePrefixes.length];
  const root = nameRoots[Math.floor(index / namePrefixes.length) % nameRoots.length];
  return `${prefix}${root}`;
}

function isLand(tile: Tile) {
  return tile.terrain !== "ocean";
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function fbm(x: number, y: number, seed: number, octaves: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let max = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += noise2D(x * frequency, y * frequency, seed + i * 1013) * amplitude;
    max += amplitude;
    amplitude *= 0.52;
    frequency *= 2;
  }

  return value / max;
}

function noise2D(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);
  const n00 = randomAt(x0, y0, seed);
  const n10 = randomAt(x1, y0, seed);
  const n01 = randomAt(x0, y1, seed);
  const n11 = randomAt(x1, y1, seed);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);

  return lerp(ix0, ix1, sy);
}

function randomAt(x: number, y: number, seed: number) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
