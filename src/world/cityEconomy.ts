import { getTileMonthlyYield } from "./economy";
import type { City, Terrain, World } from "./types";

export type CityEconomy = {
  population: number;
  monthlyGold: number;
  army: number;
  defense: number;
};

export type NationCityEconomy = {
  population: number;
  monthlyGold: number;
  army: number;
  maxDefense: number;
};

export function calculateCityEconomy(city: City, world: World): CityEconomy {
  const tile = world.tiles.find((worldTile) => worldTile.x === city.x && worldTile.y === city.y);
  const provinceTiles = world.tiles.filter((worldTile) => worldTile.provinceId === city.provinceId);
  const resourceOutput = provinceTiles.reduce((sum, provinceTile) => {
    const yieldValue = getTileMonthlyYield(provinceTile);
    return sum + (yieldValue?.amount ?? 0);
  }, 0);
  const terrain = tile?.terrain ?? "plain";
  const terrainGold = terrainGoldBonus(terrain);
  const terrainDefense = terrainDefenseBonus(terrain);
  const capitalGold = city.isCapital ? 18 : 0;
  const capitalArmy = city.isCapital ? 220 : 0;
  const capitalDefense = city.isCapital ? 2 : 0;
  const monthlyGold = Math.round(
    city.population / 950 +
      city.level * 9 +
      resourceOutput * 0.72 +
      terrainGold +
      capitalGold,
  );
  const army = Math.round(
    city.population * (city.isCapital ? 0.026 : 0.017) +
      city.level * 135 +
      resourceOutput * 7 +
      capitalArmy,
  );
  const defense = clampInt(
    Math.round(city.level + terrainDefense + capitalDefense + resourceOutput / 24),
    1,
    12,
  );

  return {
    army,
    defense,
    monthlyGold,
    population: city.population,
  };
}

export function calculateNationCityEconomy(nationId: string, world: World): NationCityEconomy {
  const cityEconomies = world.cities
    .filter((city) => city.nationId === nationId)
    .map((city) => calculateCityEconomy(city, world));

  return cityEconomies.reduce<NationCityEconomy>(
    (total, economy) => ({
      army: total.army + economy.army,
      maxDefense: Math.max(total.maxDefense, economy.defense),
      monthlyGold: total.monthlyGold + economy.monthlyGold,
      population: total.population + economy.population,
    }),
    { army: 0, maxDefense: 0, monthlyGold: 0, population: 0 },
  );
}

function terrainGoldBonus(terrain: Terrain) {
  switch (terrain) {
    case "coast":
      return 10;
    case "plain":
      return 8;
    case "forest":
      return 5;
    case "hill":
      return 3;
    case "desert":
      return -2;
    case "mountain":
      return -4;
    case "ocean":
      return 0;
  }
}

function terrainDefenseBonus(terrain: Terrain) {
  switch (terrain) {
    case "mountain":
      return 4;
    case "hill":
      return 3;
    case "forest":
      return 2;
    case "desert":
      return 1;
    case "coast":
      return 1;
    case "plain":
      return 0;
    case "ocean":
      return 0;
  }
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
