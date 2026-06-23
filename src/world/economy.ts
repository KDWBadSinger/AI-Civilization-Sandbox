import type { Resource, Tile } from "./types";

export type ResourceYield = {
  resource: Resource;
  amount: number;
};

export type ResourceTotals = Partial<Record<Resource, number>>;

const resourceMonthlyOutput: Record<Resource, number> = {
  grain: 6,
  timber: 4,
  iron: 3,
  coal: 3,
  oil: 2,
};

export function getTileMonthlyYield(tile: Tile): ResourceYield | undefined {
  if (!tile.resource) {
    return undefined;
  }

  return {
    resource: tile.resource,
    amount: resourceMonthlyOutput[tile.resource],
  };
}

export function addYield(totals: ResourceTotals, yieldValue: ResourceYield) {
  totals[yieldValue.resource] = (totals[yieldValue.resource] ?? 0) + yieldValue.amount;
}

export function formatResourceName(resource: Resource) {
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}
