import type { MapEdge, Nation, World } from "./types";

export type NationRelation = {
  nationAId: string;
  nationBId: string;
  attitude: number;
  lastChangedMonth: number;
};

export type NationRelations = Record<string, NationRelation>;

export function buildInitialNationRelations(world: World): NationRelations {
  const borderPressure = calculateBorderPressure(world);

  return Object.fromEntries(
    nationPairs(world.nations).map(([nationA, nationB]) => {
      const key = relationKey(nationA.id, nationB.id);
      const sharedBorder = borderPressure.get(key) ?? 0;
      const capitalDistance = getCapitalDistance(world, nationA, nationB);
      const distanceFriendliness = clamp(Math.round((capitalDistance - 22) * 1.25), -18, 18);
      const borderTension = sharedBorder > 0 ? clamp(10 + Math.round(sharedBorder / 18), 10, 24) : 0;
      const personalityNoise = seededPairNoise(world.seed, nationA.id, nationB.id);
      const attitude = clamp(
        Math.round(2 + distanceFriendliness - borderTension + personalityNoise),
        -100,
        100,
      );

      return [
        key,
        {
          nationAId: nationA.id,
          nationBId: nationB.id,
          attitude,
          lastChangedMonth: 0,
        },
      ];
    }),
  );
}

export function getNationRelation(
  relations: NationRelations,
  nationAId: string,
  nationBId: string,
) {
  return relations[relationKey(nationAId, nationBId)];
}

export function getNationRelationsFor(
  relations: NationRelations,
  nationId: string,
) {
  return Object.values(relations)
    .filter((relation) => relation.nationAId === nationId || relation.nationBId === nationId)
    .sort((a, b) => a.attitude - b.attitude);
}

export function otherNationId(relation: NationRelation, nationId: string) {
  return relation.nationAId === nationId ? relation.nationBId : relation.nationAId;
}

export function relationKey(nationAId: string, nationBId: string) {
  return [nationAId, nationBId].sort().join("__");
}

export function getAttitudeLabel(attitude: number) {
  if (attitude <= -60) {
    return "Hostile";
  }

  if (attitude <= -25) {
    return "Wary";
  }

  if (attitude < 25) {
    return "Neutral";
  }

  if (attitude < 60) {
    return "Friendly";
  }

  return "Trusted";
}

function nationPairs(nations: Nation[]) {
  const pairs: Array<[Nation, Nation]> = [];

  for (let a = 0; a < nations.length; a += 1) {
    for (let b = a + 1; b < nations.length; b += 1) {
      pairs.push([nations[a], nations[b]]);
    }
  }

  return pairs;
}

function calculateBorderPressure(world: World) {
  const pressure = new Map<string, number>();

  for (const edge of world.nationEdges) {
    const pair = nationsAcrossEdge(edge, world);
    if (!pair) {
      continue;
    }

    const key = relationKey(pair[0], pair[1]);
    pressure.set(key, (pressure.get(key) ?? 0) + 1);
  }

  return pressure;
}

function nationsAcrossEdge(edge: MapEdge, world: World): [string, string] | undefined {
  const midX = (edge.x1 + edge.x2) / 2;
  const midY = (edge.y1 + edge.y2) / 2;
  const isVertical = edge.x1 === edge.x2;
  const samples = isVertical
    ? [
        { x: Math.floor(midX - 0.01), y: Math.floor(midY) },
        { x: Math.floor(midX + 0.01), y: Math.floor(midY) },
      ]
    : [
        { x: Math.floor(midX), y: Math.floor(midY - 0.01) },
        { x: Math.floor(midX), y: Math.floor(midY + 0.01) },
      ];
  const nationIds = samples
    .map(({ x, y }) => world.tiles.find((tile) => tile.x === x && tile.y === y))
    .map((tile) => {
      const province = tile?.provinceId ? world.provinceById.get(tile.provinceId) : undefined;
      return province?.nationId;
    })
    .filter((nationId): nationId is string => Boolean(nationId));

  if (nationIds.length !== 2 || nationIds[0] === nationIds[1]) {
    return undefined;
  }

  return [nationIds[0], nationIds[1]];
}

function getCapitalDistance(world: World, nationA: Nation, nationB: Nation) {
  const capitalA = nationA.capitalCityId ? world.cityById.get(nationA.capitalCityId) : undefined;
  const capitalB = nationB.capitalCityId ? world.cityById.get(nationB.capitalCityId) : undefined;
  const fallbackA = world.provinceById.get(nationA.capitalProvinceId);
  const fallbackB = world.provinceById.get(nationB.capitalProvinceId);
  const ax = capitalA?.x ?? fallbackA?.centerX ?? 0;
  const ay = capitalA?.y ?? fallbackA?.centerY ?? 0;
  const bx = capitalB?.x ?? fallbackB?.centerX ?? 0;
  const by = capitalB?.y ?? fallbackB?.centerY ?? 0;

  return Math.hypot(ax - bx, ay - by);
}

function seededPairNoise(seed: string, nationAId: string, nationBId: string) {
  const value = `${seed}:${relationKey(nationAId, nationBId)}`;
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.round(((hash >>> 0) / 4294967295 - 0.5) * 24);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
