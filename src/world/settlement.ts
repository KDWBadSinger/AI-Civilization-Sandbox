import { calculateNationCityEconomy } from "./cityEconomy";
import { addYield, getTileMonthlyYield, resourceTypes, type ResourceTotals } from "./economy";
import { isNationActive } from "./nationStatus";
import type { Resource, World } from "./types";

export type NationStockpile = {
  gold: number;
  resources: ResourceTotals;
};

export type NationStockpiles = Record<string, NationStockpile>;

export type NationMonthlyIncome = {
  gold: number;
  resources: ResourceTotals;
};

export function buildInitialNationStockpiles(world: World): NationStockpiles {
  return Object.fromEntries(
    world.nations.map((nation) => [
      nation.id,
      {
        gold: 0,
        resources: emptyResources(),
      },
    ]),
  );
}

export function calculateNationMonthlyIncome(world: World, nationId: string): NationMonthlyIncome {
  const provinceIds = new Set(
    world.provinces
      .filter((province) => province.nationId === nationId)
      .map((province) => province.id),
  );
  const resources = emptyResources();

  for (const tile of world.tiles) {
    if (!tile.provinceId || !provinceIds.has(tile.provinceId)) {
      continue;
    }

    const yieldValue = getTileMonthlyYield(tile);
    if (yieldValue) {
      addYield(resources, yieldValue);
    }
  }

  return {
    gold: calculateNationCityEconomy(nationId, world).monthlyGold,
    resources,
  };
}

export function settleNationStockpiles(
  world: World,
  currentStockpiles: NationStockpiles,
  months: number,
): NationStockpiles {
  return Object.fromEntries(
    world.nations.map((nation) => {
      const current = currentStockpiles[nation.id] ?? {
        gold: 0,
        resources: emptyResources(),
      };
      if (!isNationActive(world, nation.id)) {
        return [nation.id, { gold: 0, resources: emptyResources() }];
      }

      const income = calculateNationMonthlyIncome(world, nation.id);

      return [
        nation.id,
        {
          gold: current.gold + income.gold * months,
          resources: addResourceTotals(current.resources, income.resources, months),
        },
      ];
    }),
  );
}

function addResourceTotals(
  current: ResourceTotals,
  monthlyIncome: ResourceTotals,
  months: number,
) {
  return Object.fromEntries(
    resourceTypes.map((resource) => [
      resource,
      (current[resource] ?? 0) + (monthlyIncome[resource] ?? 0) * months,
    ]),
  ) as ResourceTotals;
}

function emptyResources() {
  return Object.fromEntries(resourceTypes.map((resource) => [resource, 0])) as Record<Resource, number>;
}
