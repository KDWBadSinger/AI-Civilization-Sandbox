import { calculateNationCityEconomy } from "./cityEconomy";
import type { DiplomacyState, WarState } from "./diplomacy";
import type { GameEvent } from "./events";
import type { NationPolicies } from "./policyAI";
import {
  adjustNationRelation,
  getNationRelation,
  relationKey,
  type NationRelations,
} from "./relationships";
import type { NationStockpiles } from "./settlement";
import type { Province, Resource, Terrain, Tile, World } from "./types";
import type { SpyNetwork } from "./spies";

export type UnitType = "militia" | "infantry" | "lightCavalry" | "heavyCavalry";

export type UnitStats = {
  label: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  upkeepGold: number;
  recruitGold: number;
};

export type ArmyUnits = Record<UnitType, number>;

export type ArmyStance = "attack" | "defend" | "garrison" | "rally" | "raid" | "retreat";

export type RecruitmentOrder = {
  id: string;
  nationId: string;
  cityId: string;
  unitType: UnitType;
  amount: number;
  startedAtMonth: number;
  completesAtMonth: number;
};

export type ArmyGroup = {
  id: string;
  nationId: string;
  locationProvinceId: string;
  destinationProvinceId?: string;
  objectiveProvinceId?: string;
  pathProvinceIds: string[];
  movementProgress: number;
  units: ArmyUnits;
  stance: ArmyStance;
  originCityId?: string;
  createdAtMonth: number;
  updatedAtMonth: number;
};

export type NationMilitary = {
  nationId: string;
  units: ArmyUnits;
  cityGarrisons: Record<string, ArmyUnits>;
  armyGroups: ArmyGroup[];
  recruitmentQueue: RecruitmentOrder[];
  morale: number;
  lastDisbandMonth?: number;
  lastUpkeepShortageMonth?: number;
  lastArmyCommandMonth?: number;
};

export type MilitaryState = Record<string, NationMilitary>;

export type WarUpdate = {
  diplomacy: DiplomacyState;
  events: GameEvent[];
  mapChanged: boolean;
  military: MilitaryState;
  relations: NationRelations;
};

export type MilitaryEconomyUpdate = {
  events: GameEvent[];
  military: MilitaryState;
  stockpiles: NationStockpiles;
};

export type MilitaryMovementUpdate = {
  events: GameEvent[];
  mapChanged: boolean;
  military: MilitaryState;
};

export type CityGarrisonSummary = {
  cityId: string;
  cityName: string;
  provinceName: string;
  totalSoldiers: number;
  units: ArmyUnits;
};

export type NationWarSummary = {
  activeWars: Array<WarState & { enemyNationId: string }>;
  army: NationMilitary;
  armyGroups: ArmyGroup[];
  cityGarrisons: CityGarrisonSummary[];
  recruitmentQueue: RecruitmentOrder[];
  totalSoldiers: number;
  monthlyUpkeep: number;
  attackPower: number;
  defensePower: number;
};

export const unitTypes: UnitType[] = ["militia", "infantry", "lightCavalry", "heavyCavalry"];

export const unitStats: Record<UnitType, UnitStats> = {
  militia: {
    attack: 4,
    defense: 3,
    hp: 60,
    label: "Militia",
    recruitGold: 0.8,
    speed: 1,
    upkeepGold: 0.4,
  },
  infantry: {
    attack: 7,
    defense: 7,
    hp: 100,
    label: "Infantry",
    recruitGold: 2,
    speed: 1,
    upkeepGold: 1,
  },
  lightCavalry: {
    attack: 8,
    defense: 5,
    hp: 80,
    label: "Light Cavalry",
    recruitGold: 3.5,
    speed: 3,
    upkeepGold: 1.8,
  },
  heavyCavalry: {
    attack: 12,
    defense: 10,
    hp: 140,
    label: "Heavy Cavalry",
    recruitGold: 6,
    speed: 2,
    upkeepGold: 3,
  },
};

const unitRecruitResourceCosts: Record<UnitType, Partial<Record<Resource, number>>> = {
  heavyCavalry: { grain: 1.8, iron: 0.8, coal: 0.25 },
  infantry: { grain: 1.1, iron: 0.45, timber: 0.15 },
  lightCavalry: { grain: 1.6, iron: 0.25, timber: 0.45 },
  militia: { grain: 0.75, timber: 0.1 },
};

const unitMonthlyResourceUpkeep: Record<UnitType, Partial<Record<Resource, number>>> = {
  heavyCavalry: { coal: 0.018, grain: 0.16, iron: 0.035 },
  infantry: { grain: 0.09, iron: 0.012 },
  lightCavalry: { grain: 0.13, timber: 0.018 },
  militia: { grain: 0.055 },
};

const truceAfterWarMonths = 18;
const armyCommandIntervalMonths = 3;

export function buildInitialMilitaryState(world: World): MilitaryState {
  return Object.fromEntries(
    world.nations.map((nation) => {
      const cities = world.cities.filter((city) => city.nationId === nation.id);
      const units = buildInitialUnits(calculateNationCityEconomy(nation.id, world).army);
      const cityGarrisons = distributeUnitsToCities(units, cities);

      return [
        nation.id,
        {
          armyGroups: [],
          cityGarrisons,
          morale: 0.92,
          nationId: nation.id,
          recruitmentQueue: [],
          units,
        },
      ];
    }),
  );
}

export function advanceMilitaryEconomy(
  world: World,
  currentMilitary: MilitaryState,
  currentStockpiles: NationStockpiles,
  policies: NationPolicies,
  diplomacy: DiplomacyState,
  currentMonth: number,
  months: number,
): MilitaryEconomyUpdate {
  const events: GameEvent[] = [];
  const nextMilitary = cloneMilitary(currentMilitary);
  const nextStockpiles: NationStockpiles = Object.fromEntries(
    Object.entries(currentStockpiles).map(([nationId, stockpile]) => [
      nationId,
      { gold: stockpile.gold, resources: { ...stockpile.resources } },
    ]),
  );

  for (const nation of world.nations) {
    let army = nextMilitary[nation.id] ?? {
      armyGroups: [],
      cityGarrisons: {},
      morale: 0.8,
      nationId: nation.id,
      recruitmentQueue: [],
      units: emptyUnits(),
    };
    army = completeRecruitment(world, army, currentMonth, events);
    const stockpile = nextStockpiles[nation.id] ?? { gold: 0, resources: {} };
    const upkeep = calculateMonthlyUpkeep(army.units) * months;

    if (upkeep <= stockpile.gold) {
      stockpile.gold -= upkeep;
      army.morale = clamp(army.morale + 0.018 * months, 0.35, 1);
    } else {
      stockpile.gold = 0;
      army.morale = clamp(army.morale - 0.055 * months, 0.28, 1);
      if (
        army.lastUpkeepShortageMonth === undefined ||
        currentMonth - army.lastUpkeepShortageMonth >= 6
      ) {
        army.lastUpkeepShortageMonth = currentMonth;
        events.push({
          description: `${nation.name} could not fully pay military upkeep; army morale fell to ${Math.round(army.morale * 100)}%.`,
          id: `event-military-shortage-${nation.id}-${currentMonth}`,
          kind: "military_upkeep_shortage",
          month: currentMonth,
          nationIds: [nation.id],
          title: "Military Upkeep Shortage",
        });
      }
    }

    const supply = payMilitarySupplies(army.units, stockpile, months);
    if (!supply.paid) {
      army.morale = clamp(army.morale - 0.035 * months, 0.25, 1);
      if (
        army.lastUpkeepShortageMonth === undefined ||
        currentMonth - army.lastUpkeepShortageMonth >= 6
      ) {
        army.lastUpkeepShortageMonth = currentMonth;
        events.push({
          description: `${nation.name} lacked military supplies; army morale fell to ${Math.round(army.morale * 100)}%.`,
          id: `event-military-supply-shortage-${nation.id}-${currentMonth}`,
          kind: "military_supply_shortage",
          month: currentMonth,
          nationIds: [nation.id],
          title: "Military Supply Shortage",
        });
      }
    }

    army = disbandExcessMilitary(world, diplomacy, army, stockpile, policies[nation.id], currentMonth, events);
    const recruited = queueRecruitmentForPolicy(world, army, stockpile, policies[nation.id], nation.id, currentMonth);
    const development = investSurplusInCities(
      world,
      recruited.stockpile,
      policies[nation.id],
      nation.id,
      currentMonth,
      events,
    );
    nextMilitary[nation.id] = recruited.army;
    nextStockpiles[nation.id] = development.stockpile;
  }

  return {
    events,
    military: nextMilitary,
    stockpiles: nextStockpiles,
  };
}

export function advanceArmyGroups(
  world: World,
  diplomacy: DiplomacyState,
  currentMilitary: MilitaryState,
  currentMonth: number,
): MilitaryMovementUpdate {
  const events: GameEvent[] = [];
  let mapChanged = false;
  const nextMilitary = cloneMilitary(currentMilitary);

  for (const nation of world.nations) {
    let army = nextMilitary[nation.id] ?? {
      armyGroups: [],
      cityGarrisons: {},
      morale: 0.8,
      nationId: nation.id,
      recruitmentQueue: [],
      units: emptyUnits(),
    };

    if (
      army.lastArmyCommandMonth === undefined ||
      currentMonth - army.lastArmyCommandMonth >= armyCommandIntervalMonths
    ) {
      const commandResult = issueArmyCommands(world, diplomacy, army, currentMonth);
      army = commandResult.army;
      army.lastArmyCommandMonth = currentMonth;
      events.push(...commandResult.events);
      mapChanged ||= commandResult.mapChanged;
    }

    const movement = moveArmyGroups(world, army, currentMonth);
    army = movement.army;
    events.push(...movement.events);
    mapChanged ||= movement.mapChanged;
    nextMilitary[nation.id] = recalculateNationUnits(army);
  }

  return {
    events,
    mapChanged,
    military: nextMilitary,
  };
}

export function advanceWarSystem(
  world: World,
  diplomacy: DiplomacyState,
  currentMilitary: MilitaryState,
  currentRelations: NationRelations,
  spyNetwork: SpyNetwork,
  currentMonth: number,
): WarUpdate {
  const events: GameEvent[] = [];
  const nextMilitary = cloneMilitary(currentMilitary);
  let relations = currentRelations;
  let mapChanged = false;
  const nextWars: WarState[] = [];

  for (const war of diplomacy.wars) {
    const attacker = world.nationById.get(war.attackerNationId);
    const defender = world.nationById.get(war.defenderNationId);

    if (!attacker || !defender || !nationExists(world, attacker.id) || !nationExists(world, defender.id)) {
      events.push(buildWarEvent({
        currentMonth,
        description: `${nationName(world, war.attackerNationId)} and ${nationName(world, war.defenderNationId)} ended their war because one side no longer controls territory.`,
        id: `event-war-ended-invalid-${war.id}-${currentMonth}`,
        kind: "war_ended",
        nationIds: [war.attackerNationId, war.defenderNationId],
        title: "War Ended",
      }));
      continue;
    }

    let updatedWar = { ...war };
    if (updatedWar.relationPenaltyAppliedMonth === undefined) {
      relations = worsenRelationToAtMost(relations, attacker.id, defender.id, -35, currentMonth);
      updatedWar.relationPenaltyAppliedMonth = currentMonth;
    }

    const engagements = findWarEngagements(world, nextMilitary, updatedWar);
    if (engagements.length === 0) {
      if (
        !hasWarFront(world, updatedWar.attackerNationId, updatedWar.defenderNationId) ||
        !hasReachableWarObjective(world, nextMilitary, updatedWar)
      ) {
        events.push(buildWarEvent({
          currentMonth,
          description: `${attacker.name} and ${defender.name} signed a truce after their armies could no longer reach a viable front.`,
          id: `event-war-ended-no-front-${updatedWar.id}-${currentMonth}`,
          kind: "war_ended",
          nationIds: [attacker.id, defender.id],
          title: "War Ended",
        }));
        relations = adjustNationRelation(relations, attacker.id, defender.id, -4, currentMonth);
        continue;
      }
      nextWars.push(updatedWar);
      continue;
    }

    let endedWar = false;

    for (const engagement of engagements) {
      const targetProvince = world.provinceById.get(engagement.provinceId);
      if (!targetProvince) {
        continue;
      }

      const battle = resolveBattle({
        attackerNationId: attacker.id,
        attackerGroupIds: engagement.attackerGroupIds,
        currentMonth,
        defenderNationId: defender.id,
        defenderGroupIds: engagement.defenderGroupIds,
        spyNetwork,
        targetProvince,
        war: updatedWar,
        world,
        military: nextMilitary,
      });
      nextMilitary[attacker.id] = battle.attackerArmy;
      nextMilitary[defender.id] = battle.defenderArmy;
      events.push(battle.event);
      relations = adjustNationRelation(relations, attacker.id, defender.id, -2, currentMonth);

      let attackerScore = (updatedWar.attackerScore ?? 0) + (battle.attackerWon ? 1 : -0.5);
      let defenderScore = (updatedWar.defenderScore ?? 0) + (battle.attackerWon ? -0.5 : 1);

      if (battle.attackerWon && targetProvince.nationId === defender.id) {
        const transfer = transferProvince(world, targetProvince.id, attacker.id, defender.id, currentMonth);
        removeCapturedCityGarrisons(nextMilitary, transfer.capturedCities, defender.id);
        mapChanged = true;
        relations = adjustNationRelation(
          relations,
          attacker.id,
          defender.id,
          -8 - transfer.capturedCities.length * 4,
          currentMonth,
        );
        events.push(...transfer.events);
        attackerScore += transfer.capturedCities.length > 0 ? 1 : 0;

        if (!nationExists(world, defender.id)) {
          events.push(buildWarEvent({
            currentMonth,
            description: `${defender.name} lost its last province and was defeated by ${attacker.name}.`,
            id: `event-nation-defeated-${defender.id}-${currentMonth}`,
            kind: "nation_defeated",
            nationIds: [attacker.id, defender.id],
            title: "Nation Defeated",
          }));
          endedWar = true;
          break;
        }
      }

      if (!battle.attackerWon && targetProvince.nationId === attacker.id && engagement.defenderGroupIds.length > 0) {
        const transfer = transferProvince(world, targetProvince.id, defender.id, attacker.id, currentMonth);
        removeCapturedCityGarrisons(nextMilitary, transfer.capturedCities, attacker.id);
        mapChanged = true;
        relations = adjustNationRelation(
          relations,
          attacker.id,
          defender.id,
          -8 - transfer.capturedCities.length * 4,
          currentMonth,
        );
        events.push(...transfer.events);
        defenderScore += transfer.capturedCities.length > 0 ? 1 : 0;

        if (!nationExists(world, attacker.id)) {
          events.push(buildWarEvent({
            currentMonth,
            description: `${attacker.name} lost its last province and was defeated by ${defender.name}.`,
            id: `event-nation-defeated-${attacker.id}-${currentMonth}`,
            kind: "nation_defeated",
            nationIds: [attacker.id, defender.id],
            title: "Nation Defeated",
          }));
          endedWar = true;
          break;
        }
      }

      updatedWar = {
        ...updatedWar,
        attackerScore,
        battleCount: (updatedWar.battleCount ?? 0) + 1,
        defenderScore,
        lastBattleMonth: currentMonth,
        targetProvinceId: targetProvince.id,
      };

      if (shouldEndWar(updatedWar, nextMilitary[attacker.id], nextMilitary[defender.id])) {
        events.push(buildWarEvent({
          currentMonth,
          description: `${attacker.name} and ${defender.name} agreed to an ${truceAfterWarMonths}-month truce after sustained fighting.`,
          id: `event-war-ended-${updatedWar.id}-${currentMonth}`,
          kind: "war_ended",
          nationIds: [attacker.id, defender.id],
          title: "War Ended",
        }));
        relations = adjustNationRelation(relations, attacker.id, defender.id, -4, currentMonth);
        endedWar = true;
        break;
      }
    }

    if (endedWar) {
      continue;
    }

    nextWars.push(updatedWar);
  }

  return {
    diplomacy: {
      ...diplomacy,
      truces: [
        ...diplomacy.truces.filter((truce) => truce.expiresAtMonth > currentMonth),
        ...buildTrucesForEndedEvents(events, currentMonth),
      ],
      wars: dedupeWars(nextWars),
    },
    events,
    mapChanged,
    military: nextMilitary,
    relations,
  };
}

function findWarEngagements(
  world: World,
  military: MilitaryState,
  war: WarState,
) {
  const attackerArmy = military[war.attackerNationId];
  const defenderArmy = military[war.defenderNationId];
  if (!attackerArmy || !defenderArmy) {
    return [];
  }

  const provinceIds = new Set<string>();
  for (const group of attackerArmy.armyGroups) {
    provinceIds.add(group.locationProvinceId);
  }
  for (const group of defenderArmy.armyGroups) {
    provinceIds.add(group.locationProvinceId);
  }

  return [...provinceIds]
    .map((provinceId) => {
      const province = world.provinceById.get(provinceId);
      const attackerGroupIds = attackerArmy.armyGroups
        .filter((group) => group.locationProvinceId === provinceId && totalUnits(group.units) > 0)
        .map((group) => group.id);
      const defenderGroupIds = defenderArmy.armyGroups
        .filter((group) => group.locationProvinceId === provinceId && totalUnits(group.units) > 0)
        .map((group) => group.id);
      const attackerInvading = attackerGroupIds.length > 0 && province?.nationId === war.defenderNationId;
      const defenderCounterInvading = defenderGroupIds.length > 0 && province?.nationId === war.attackerNationId;
      const directContact = attackerGroupIds.length > 0 && defenderGroupIds.length > 0;

      if (!directContact && !attackerInvading && !defenderCounterInvading) {
        return undefined;
      }

      return {
        attackerGroupIds,
        defenderGroupIds,
        provinceId,
      };
    })
    .filter((engagement): engagement is {
      attackerGroupIds: string[];
      defenderGroupIds: string[];
      provinceId: string;
    } => Boolean(engagement))
    .sort((a, b) => scoreTargetProvince(world, world.provinceById.get(b.provinceId)!) -
      scoreTargetProvince(world, world.provinceById.get(a.provinceId)!));
}

function hasWarFront(world: World, attackerNationId: string, defenderNationId: string) {
  return Boolean(pickTargetProvince(world, attackerNationId, defenderNationId)) ||
    Boolean(pickTargetProvince(world, defenderNationId, attackerNationId));
}

function hasReachableWarObjective(world: World, military: MilitaryState, war: WarState) {
  return canReachWarTarget(world, military[war.attackerNationId], war.defenderNationId) ||
    canReachWarTarget(world, military[war.defenderNationId], war.attackerNationId);
}

function canReachWarTarget(
  world: World,
  army: NationMilitary | undefined,
  enemyNationId: string,
) {
  if (!army) {
    return false;
  }

  const target = pickTargetProvince(world, army.nationId, enemyNationId);
  if (!target) {
    return false;
  }

  const origins = [
    ...army.armyGroups.map((group) => group.locationProvinceId),
    ...world.cities
      .filter((city) => city.nationId === army.nationId)
      .map((city) => city.provinceId),
  ];

  return origins.some((originProvinceId) => {
    const path = findProvincePath(world, army.nationId, originProvinceId, target.id);
    return path.length > 1 || originProvinceId === target.id;
  });
}

export function getNationWarSummary(
  diplomacy: DiplomacyState,
  military: MilitaryState,
  world: World,
  nationId: string,
): NationWarSummary {
  const army = military[nationId] ?? {
    armyGroups: [],
    cityGarrisons: {},
    morale: 0,
    nationId,
    recruitmentQueue: [],
    units: emptyUnits(),
  };
  const activeWars = diplomacy.wars
    .filter((war) => war.attackerNationId === nationId || war.defenderNationId === nationId)
    .map((war) => ({
      ...war,
      enemyNationId: war.attackerNationId === nationId ? war.defenderNationId : war.attackerNationId,
    }));

  return {
    activeWars,
    army,
    armyGroups: [...army.armyGroups].sort((a, b) => totalUnits(b.units) - totalUnits(a.units)),
    attackPower: Math.round(calculateArmyAttackPower(army) * army.morale),
    cityGarrisons: getCityGarrisonSummaries(world, army),
    defensePower: Math.round(calculateArmyDefensePower(army) * army.morale),
    monthlyUpkeep: calculateMonthlyUpkeep(army.units),
    recruitmentQueue: [...army.recruitmentQueue].sort((a, b) => a.completesAtMonth - b.completesAtMonth),
    totalSoldiers: totalUnits(army.units),
  };
}

export function getAllArmyGroups(military: MilitaryState) {
  return Object.values(military).flatMap((army) => army.armyGroups);
}

export function calculateMilitaryPower(military: MilitaryState, nationId: string) {
  const army = military[nationId];
  if (!army) {
    return 0;
  }

  return (calculateArmyAttackPower(army) + calculateArmyDefensePower(army)) * army.morale;
}

function buildInitialUnits(armyScore: number): ArmyUnits {
  const soldiers = Math.max(90, Math.round(armyScore / 28));

  return {
    heavyCavalry: Math.round(soldiers * 0.07),
    infantry: Math.round(soldiers * 0.43),
    lightCavalry: Math.round(soldiers * 0.12),
    militia: Math.round(soldiers * 0.38),
  };
}

function queueRecruitmentForPolicy(
  world: World,
  army: NationMilitary,
  stockpile: NationStockpiles[string],
  policy: NationPolicies[string] | undefined,
  nationId: string,
  currentMonth: number,
) {
  const currentTotal = totalUnits(army.units);
  const desiredTotal = calculateDesiredArmySize(world, nationId, policy);

  const queuedTotal = army.recruitmentQueue.reduce((sum, order) => sum + order.amount, 0);

  if (
    currentTotal + queuedTotal >= desiredTotal ||
    stockpile.gold < Math.max(30, calculateMonthlyUpkeep(army.units) * 1.25)
  ) {
    return { army, stockpile };
  }

  const cities = world.cities
    .filter((city) => city.nationId === nationId)
    .sort((a, b) => Number(b.isCapital) - Number(a.isCapital) || b.level - a.level);
  const recruitNeed = desiredTotal - currentTotal - queuedTotal;
  if (recruitNeed <= 0 || cities.length === 0) {
    return { army, stockpile };
  }

  const weights: ArmyUnits = policy?.economy.policy === "army_building"
    ? { heavyCavalry: 0.1, infantry: 0.48, lightCavalry: 0.16, militia: 0.26 }
    : { heavyCavalry: 0.04, infantry: 0.4, lightCavalry: 0.1, militia: 0.46 };
  const nextArmy: NationMilitary = cloneArmy(army);
  let remainingGold = stockpile.gold;
  let remainingNeed = Math.min(recruitNeed, Math.ceil(desiredTotal * 0.035));

  for (const city of cities) {
    if (remainingNeed <= 0) {
      break;
    }
    const existingCityOrders = nextArmy.recruitmentQueue.filter((order) => order.cityId === city.id).length;
    if (existingCityOrders >= 2) {
      continue;
    }

    const unitType = chooseRecruitmentUnitType(weights, world.seed, city.id, currentMonth + existingCityOrders);
    const amount = Math.min(remainingNeed, cityRecruitmentCapacity(city));
    const cost = amount * unitStats[unitType].recruitGold;
    const resourceCost = multiplyResourceCosts(unitRecruitResourceCosts[unitType], amount);
    if (amount <= 0 || cost > remainingGold || !hasResources(stockpile.resources, resourceCost)) {
      continue;
    }

    remainingGold -= cost;
    spendResources(stockpile.resources, resourceCost);
    remainingNeed -= amount;
    nextArmy.recruitmentQueue.push({
      amount,
      cityId: city.id,
      completesAtMonth: currentMonth + recruitmentTimeMonths(unitType, city.isCapital),
      id: `recruit-${nationId}-${city.id}-${unitType}-${currentMonth}-${nextArmy.recruitmentQueue.length}`,
      nationId,
      startedAtMonth: currentMonth,
      unitType,
    });
  }

  return {
    army: nextArmy,
    stockpile: {
      ...stockpile,
      gold: remainingGold,
    },
  };
}

function disbandExcessMilitary(
  world: World,
  diplomacy: DiplomacyState,
  army: NationMilitary,
  stockpile: NationStockpiles[string],
  policy: NationPolicies[string] | undefined,
  currentMonth: number,
  events: GameEvent[],
) {
  if (isNationAtWar(diplomacy, army.nationId) || totalUnits(army.units) <= 0) {
    return army;
  }

  if (army.lastDisbandMonth !== undefined && currentMonth - army.lastDisbandMonth < 12) {
    return army;
  }

  const currentTotal = totalUnits(army.units);
  const desiredTotal = calculateDesiredArmySize(world, army.nationId, policy);
  const monthlyUpkeep = calculateMonthlyUpkeep(army.units);
  const queuedTotal = army.recruitmentQueue.reduce((sum, order) => sum + order.amount, 0);
  const overbuilt = currentTotal + queuedTotal > desiredTotal * 1.32;
  const expensiveArmy = monthlyUpkeep > 0 && stockpile.gold < monthlyUpkeep * 2.5;
  const recoveryCut = policy?.economy.policy === "recovery" && currentTotal > desiredTotal * 1.12;

  if (!overbuilt && !expensiveArmy && !recoveryCut) {
    return army;
  }

  const pressureMultiplier = expensiveArmy ? 0.12 : 0.075;
  const targetTotal = Math.max(60, Math.round(desiredTotal * (expensiveArmy ? 1.02 : 1.12)));
  const excess = Math.max(0, currentTotal - targetTotal);
  const disbandAmount = Math.max(
    4,
    Math.min(excess, Math.ceil(currentTotal * pressureMultiplier)),
  );

  if (disbandAmount <= 0 || excess <= 0) {
    return army;
  }

  const typeOrder: UnitType[] = expensiveArmy
    ? ["heavyCavalry", "lightCavalry", "infantry", "militia"]
    : ["militia", "infantry", "lightCavalry", "heavyCavalry"];
  const result = disbandUnits(army, disbandAmount, typeOrder);
  const removedTotal = totalUnits(result.removed);

  if (removedTotal <= 0) {
    return army;
  }

  result.army.lastDisbandMonth = currentMonth;
  result.army.morale = clamp(result.army.morale - 0.018, 0.25, 1);
  events.push(buildWarEvent({
    currentMonth,
    description: `${nationName(world, army.nationId)} disbanded ${removedTotal} soldiers to reduce military expenses.`,
    id: `event-military-disbanded-${army.nationId}-${currentMonth}`,
    kind: "military_disbanded",
    nationIds: [army.nationId],
    title: "Military Disbanded",
  }));

  return result.army;
}

function calculateDesiredArmySize(
  world: World,
  nationId: string,
  policy: NationPolicies[string] | undefined,
) {
  const cityEconomy = calculateNationCityEconomy(nationId, world);
  const desiredMultiplier = policy?.economy.policy === "army_building"
    ? 1.15
    : policy?.economy.policy === "recovery"
      ? 0.82
      : 0.96;

  return Math.max(80, Math.round(cityEconomy.army / 28 * desiredMultiplier));
}

function isNationAtWar(diplomacy: DiplomacyState, nationId: string) {
  return diplomacy.wars.some((war) => war.attackerNationId === nationId || war.defenderNationId === nationId);
}

function completeRecruitment(
  world: World,
  army: NationMilitary,
  currentMonth: number,
  events: GameEvent[],
) {
  const nextArmy = cloneArmy(army);
  const remainingOrders: RecruitmentOrder[] = [];

  for (const order of nextArmy.recruitmentQueue) {
    if (order.completesAtMonth > currentMonth) {
      remainingOrders.push(order);
      continue;
    }

    const city = world.cityById.get(order.cityId);
    const cityGarrison = nextArmy.cityGarrisons[order.cityId] ?? emptyUnits();
    cityGarrison[order.unitType] += order.amount;
    nextArmy.cityGarrisons[order.cityId] = cityGarrison;
    events.push(buildWarEvent({
      currentMonth,
      description: `${order.amount} ${unitStats[order.unitType].label.toLowerCase()} finished training in ${city?.name ?? order.cityId}.`,
      id: `event-recruitment-completed-${order.id}-${currentMonth}`,
      kind: "recruitment_completed",
      nationIds: [order.nationId],
      title: "Recruitment Completed",
    }));
  }

  nextArmy.recruitmentQueue = remainingOrders;
  return recalculateNationUnits(nextArmy);
}

function chooseRecruitmentUnitType(weights: ArmyUnits, seed: string, cityId: string, currentMonth: number) {
  const roll = seededRandom(seed, `recruit:${cityId}`, currentMonth);
  let threshold = 0;

  for (const type of unitTypes) {
    threshold += weights[type];
    if (roll <= threshold) {
      return type;
    }
  }

  return "militia";
}

function recruitmentTimeMonths(unitType: UnitType, isCapital: boolean) {
  const base = {
    heavyCavalry: 5,
    infantry: 3,
    lightCavalry: 4,
    militia: 2,
  } satisfies Record<UnitType, number>;

  return Math.max(1, base[unitType] - (isCapital ? 1 : 0));
}

function cityRecruitmentCapacity(city: { isCapital: boolean; level: number }) {
  return 8 + city.level * 6 + (city.isCapital ? 12 : 0);
}

function payMilitarySupplies(
  units: ArmyUnits,
  stockpile: NationStockpiles[string],
  months: number,
) {
  const required = emptyResourceCosts();
  for (const type of unitTypes) {
    for (const [resource, amount] of Object.entries(unitMonthlyResourceUpkeep[type])) {
      required[resource as Resource] += amount * units[type] * months;
    }
  }

  if (hasResources(stockpile.resources, required)) {
    spendResources(stockpile.resources, required);
    return { paid: true };
  }

  for (const resource of Object.keys(required) as Resource[]) {
    stockpile.resources[resource] = Math.max(0, (stockpile.resources[resource] ?? 0) - required[resource]);
  }
  return { paid: false };
}

function investSurplusInCities(
  world: World,
  stockpile: NationStockpiles[string],
  policy: NationPolicies[string] | undefined,
  nationId: string,
  currentMonth: number,
  events: GameEvent[],
) {
  const cities = world.cities
    .filter((city) => city.nationId === nationId)
    .sort((a, b) => a.level - b.level || a.population - b.population);
  if (cities.length === 0) {
    return { stockpile };
  }

  const income = calculateNationCityEconomy(nationId, world);
  const shouldDevelop =
    policy?.economy.policy === "construction" ||
    stockpile.gold > income.monthlyGold * 10 ||
    Object.values(stockpile.resources).some((amount) => amount > 5000);

  if (!shouldDevelop) {
    return { stockpile };
  }

  const city = cities[0];
  const levelCostGold = 650 + city.level * 420;
  const levelCost = {
    coal: 20 + city.level * 18,
    grain: 120 + city.level * 55,
    iron: 50 + city.level * 34,
    timber: 90 + city.level * 46,
  } satisfies Partial<Record<Resource, number>>;

  if (city.level < 5 && stockpile.gold >= levelCostGold && hasResources(stockpile.resources, levelCost)) {
    stockpile.gold -= levelCostGold;
    spendResources(stockpile.resources, levelCost);
    city.level += 1;
    city.population = Math.round(city.population * 1.08);
    events.push(buildWarEvent({
      currentMonth,
      description: `${nationName(world, nationId)} invested surplus resources to develop ${city.name} to level ${city.level}.`,
      id: `event-city-developed-${city.id}-${currentMonth}`,
      kind: "city_developed",
      nationIds: [nationId],
      title: "City Developed",
    }));
    return { stockpile };
  }

  const growthGold = Math.min(
    stockpile.gold * 0.16,
    Math.max(income.monthlyGold * 8, 1500),
  );
  const growthCost = {
    coal: Math.min(stockpile.resources.coal ?? 0, 90),
    grain: Math.min(stockpile.resources.grain ?? 0, 420),
    iron: Math.min(stockpile.resources.iron ?? 0, 140),
    timber: Math.min(stockpile.resources.timber ?? 0, 150),
  } satisfies Partial<Record<Resource, number>>;

  if (growthGold >= 100 && hasResources(stockpile.resources, growthCost)) {
    stockpile.gold -= growthGold;
    spendResources(stockpile.resources, growthCost);
    city.population += Math.round(Math.min(9000, Math.sqrt(growthGold) * 70 + (growthCost.grain ?? 0) * 3));
    return { stockpile };
  }

  if (stockpile.gold > income.monthlyGold * 18) {
    stockpile.gold -= stockpile.gold * 0.1;
  }
  for (const resource of Object.keys(stockpile.resources) as Resource[]) {
    if ((stockpile.resources[resource] ?? 0) > 8000) {
      stockpile.resources[resource] = Math.round((stockpile.resources[resource] ?? 0) * 0.92);
    }
  }

  return { stockpile };
}

function multiplyResourceCosts(costs: Partial<Record<Resource, number>>, amount: number) {
  return Object.fromEntries(
    Object.entries(costs).map(([resource, value]) => [resource, value * amount]),
  ) as Partial<Record<Resource, number>>;
}

function hasResources(
  resources: Partial<Record<Resource, number>>,
  costs: Partial<Record<Resource, number>>,
) {
  return Object.entries(costs).every(([resource, amount]) =>
    (resources[resource as Resource] ?? 0) >= (amount ?? 0),
  );
}

function spendResources(
  resources: Partial<Record<Resource, number>>,
  costs: Partial<Record<Resource, number>>,
) {
  for (const [resource, amount] of Object.entries(costs)) {
    const key = resource as Resource;
    resources[key] = Math.max(0, (resources[key] ?? 0) - (amount ?? 0));
  }
}

function emptyResourceCosts() {
  return {
    coal: 0,
    grain: 0,
    iron: 0,
    oil: 0,
    timber: 0,
  } satisfies Record<Resource, number>;
}

function issueArmyCommands(
  world: World,
  diplomacy: DiplomacyState,
  army: NationMilitary,
  currentMonth: number,
) {
  let nextArmy = cloneArmy(army);
  const events: GameEvent[] = [];
  let mapChanged = false;
  const wars = diplomacy.wars.filter((war) =>
    war.attackerNationId === army.nationId || war.defenderNationId === army.nationId,
  );

  if (wars.length === 0) {
    const merge = mergeArmyGroups(nextArmy, currentMonth);
    return {
      events: merge.events,
      army: merge.army,
      mapChanged: merge.mapChanged,
    };
  }

  for (const war of wars) {
    const enemyNationId = war.attackerNationId === army.nationId ? war.defenderNationId : war.attackerNationId;
    const counterattack = currentMonth - war.startedAtMonth >= 12;
    const attackTarget = war.attackerNationId === army.nationId || counterattack
      ? pickTargetProvince(world, army.nationId, enemyNationId)
      : pickDefensiveProvince(world, army.nationId, enemyNationId);
    if (!attackTarget) {
      continue;
    }

    const isOffensiveMove = war.attackerNationId === army.nationId || counterattack;
    const rallyProvinceId = isOffensiveMove
      ? pickRallyProvince(world, army.nationId, attackTarget.id) ?? attackTarget.id
      : attackTarget.id;
    const stance: ArmyStance = isOffensiveMove ? "attack" : "defend";
    const destinationProvinceId = stance === "attack" ? attackTarget.id : rallyProvinceId;

    const existingCommitted = nextArmy.armyGroups.some((group) =>
      group.objectiveProvinceId === attackTarget.id &&
      (group.stance === "attack" || group.stance === "defend" || group.stance === "rally"),
    );
    if (!existingCommitted) {
      const created = createArmyGroupFromBestCity(
        world,
        nextArmy,
        destinationProvinceId,
        attackTarget.id,
        stance,
        currentMonth,
      );
      nextArmy = created.army;
      if (created.event) {
        events.push(created.event);
        mapChanged = true;
      }
    }

    const ordered = orderArmyGroupsTowardObjective(
      world,
      nextArmy,
      destinationProvinceId,
      attackTarget.id,
      stance,
      currentMonth,
    );
    nextArmy = ordered.army;
    events.push(...ordered.events);
    mapChanged ||= ordered.mapChanged;
  }

  const merge = mergeArmyGroups(nextArmy, currentMonth);
  nextArmy = merge.army;
  events.push(...merge.events);
  mapChanged ||= merge.mapChanged;

  return {
    army: recalculateNationUnits(nextArmy),
    events,
    mapChanged,
  };
}

function createArmyGroupFromBestCity(
  world: World,
  army: NationMilitary,
  destinationProvinceId: string,
  objectiveProvinceId: string,
  stance: ArmyStance,
  currentMonth: number,
) {
  const cityCandidates = world.cities
    .filter((city) => city.nationId === army.nationId)
    .map((city) => ({
      city,
      distance: provinceDistance(world, city.provinceId, destinationProvinceId),
      garrison: army.cityGarrisons[city.id] ?? emptyUnits(),
    }))
    .filter(({ city, garrison }) => totalUnits(garrison) > cityReserveTarget(city))
    .sort((a, b) => {
      const scoreA = totalUnits(a.garrison) - a.distance * 18;
      const scoreB = totalUnits(b.garrison) - b.distance * 18;
      return scoreB - scoreA;
    });
  const selected = cityCandidates[0];
  if (!selected) {
    return { army };
  }

  const cityReserve = cityReserveTarget(selected.city);
  const movable = Math.max(0, totalUnits(selected.garrison) - cityReserve);
  const unitsToMove = takeUnits(selected.garrison, Math.max(35, Math.floor(movable * 0.62)));
  if (totalUnits(unitsToMove) < 25) {
    return { army };
  }

  const nextArmy = cloneArmy(army);
  nextArmy.cityGarrisons[selected.city.id] = subtractUnits(
    nextArmy.cityGarrisons[selected.city.id] ?? emptyUnits(),
    unitsToMove,
  );
  const path = findProvincePath(world, army.nationId, selected.city.provinceId, destinationProvinceId);
  const group: ArmyGroup = {
    createdAtMonth: currentMonth,
    destinationProvinceId,
    id: `army-group-${army.nationId}-${selected.city.id}-${currentMonth}-${army.armyGroups.length}`,
    locationProvinceId: selected.city.provinceId,
    movementProgress: 0,
    nationId: army.nationId,
    objectiveProvinceId,
    originCityId: selected.city.id,
    pathProvinceIds: path.slice(1),
    stance,
    units: unitsToMove,
    updatedAtMonth: currentMonth,
  };
  nextArmy.armyGroups.push(group);

  return {
    army: recalculateNationUnits(nextArmy),
    event: buildWarEvent({
      currentMonth,
      description: `${nationName(world, army.nationId)} formed an army group for ${formatArmyStance(stance)} from ${selected.city.name} and ordered it toward ${world.provinceById.get(destinationProvinceId)?.name ?? destinationProvinceId}.`,
      id: `event-army-group-created-${group.id}`,
      kind: "army_group_created",
      nationIds: [army.nationId],
      title: "Army Group Created",
    }),
  };
}

function orderArmyGroupsTowardObjective(
  world: World,
  army: NationMilitary,
  destinationProvinceId: string,
  objectiveProvinceId: string,
  stance: ArmyStance,
  currentMonth: number,
) {
  const nextArmy = cloneArmy(army);
  const events: GameEvent[] = [];
  let mapChanged = false;

  for (const group of nextArmy.armyGroups) {
    const groupProvince = world.provinceById.get(group.locationProvinceId);
    const canRetask =
      group.pathProvinceIds.length === 0 &&
      groupProvince?.nationId === army.nationId;
    if (
      totalUnits(group.units) < 25 ||
      (group.stance === "retreat" && groupProvince?.nationId !== army.nationId)
    ) {
      continue;
    }
    if (!canRetask && group.objectiveProvinceId && group.objectiveProvinceId !== objectiveProvinceId) {
      continue;
    }
    const path = findProvincePath(world, army.nationId, group.locationProvinceId, destinationProvinceId);
    if (path.length <= 1) {
      continue;
    }

    const changed =
      group.destinationProvinceId !== destinationProvinceId ||
      group.stance !== stance ||
      group.pathProvinceIds.join(",") !== path.slice(1).join(",");
    if (!changed) {
      continue;
    }

    group.destinationProvinceId = destinationProvinceId;
    group.objectiveProvinceId = objectiveProvinceId;
    group.pathProvinceIds = path.slice(1);
    group.stance = stance;
    group.updatedAtMonth = currentMonth;
    mapChanged = true;
    events.push(buildWarEvent({
      currentMonth,
      description: `${nationName(world, army.nationId)} redirected an army group toward ${world.provinceById.get(destinationProvinceId)?.name ?? destinationProvinceId}.`,
      id: `event-army-group-ordered-${group.id}-${currentMonth}`,
      kind: "army_group_ordered",
      nationIds: [army.nationId],
      title: "Army Group Ordered",
    }));
  }

  return {
    army: recalculateNationUnits(nextArmy),
    events,
    mapChanged,
  };
}

function moveArmyGroups(world: World, army: NationMilitary, currentMonth: number) {
  const nextArmy = cloneArmy(army);
  const events: GameEvent[] = [];
  let mapChanged = false;

  for (const group of nextArmy.armyGroups) {
    if (group.pathProvinceIds.length === 0) {
      continue;
    }

    let groupMoved = false;
    group.movementProgress += armyGroupSpeed(group.units);
    while (group.pathProvinceIds.length > 0) {
      const nextProvinceId = group.pathProvinceIds[0];
      const cost = provinceMovementCost(world, nextProvinceId, group.units);
      if (group.movementProgress < cost) {
        break;
      }

      group.movementProgress -= cost;
      group.locationProvinceId = nextProvinceId;
      group.pathProvinceIds = group.pathProvinceIds.slice(1);
      group.updatedAtMonth = currentMonth;
      groupMoved = true;
      mapChanged = true;
    }

    if (groupMoved && group.pathProvinceIds.length === 0) {
      events.push(buildWarEvent({
        currentMonth,
        description: `${nationName(world, army.nationId)} army group reached ${world.provinceById.get(group.locationProvinceId)?.name ?? group.locationProvinceId}.`,
        id: `event-army-group-arrived-${group.id}-${currentMonth}`,
        kind: "army_group_moved",
        nationIds: [army.nationId],
        title: "Army Group Moved",
      }));
    }
  }

  return {
    army: recalculateNationUnits(nextArmy),
    events,
    mapChanged,
  };
}

function mergeArmyGroups(army: NationMilitary, currentMonth: number) {
  const nextArmy = cloneArmy(army);
  const events: GameEvent[] = [];
  let mapChanged = false;
  const byProvince = new Map<string, ArmyGroup[]>();

  for (const group of nextArmy.armyGroups) {
    const groups = byProvince.get(group.locationProvinceId) ?? [];
    groups.push(group);
    byProvince.set(group.locationProvinceId, groups);
  }

  const mergedGroups: ArmyGroup[] = [];
  for (const groups of byProvince.values()) {
    if (groups.length < 2) {
      mergedGroups.push(...groups);
      continue;
    }

    const [primary, ...rest] = groups.sort((a, b) => totalUnits(b.units) - totalUnits(a.units));
    const mergedUnits = cloneUnits(primary.units);
    for (const group of rest) {
      addUnits(mergedUnits, group.units);
    }
    mergedGroups.push({
      ...primary,
      units: mergedUnits,
      updatedAtMonth: currentMonth,
    });
    events.push(buildWarEvent({
      currentMonth,
      description: `${groups.length} army groups merged in the same province.`,
      id: `event-army-groups-merged-${nextArmy.nationId}-${primary.locationProvinceId}-${currentMonth}`,
      kind: "army_group_merged",
      nationIds: [nextArmy.nationId],
      title: "Army Groups Merged",
    }));
    mapChanged = true;
  }

  nextArmy.armyGroups = mergedGroups.filter((group) => totalUnits(group.units) > 0);
  return {
    army: recalculateNationUnits(nextArmy),
    events,
    mapChanged,
  };
}

function pickDefensiveProvince(world: World, defenderNationId: string, attackerNationId: string) {
  const adjacency = buildProvinceAdjacency(world);
  const attackerProvinceIds = new Set(
    world.provinces
      .filter((province) => province.nationId === attackerNationId)
      .map((province) => province.id),
  );

  return world.provinces
    .filter((province) =>
      province.nationId === defenderNationId &&
      [...(adjacency.get(province.id) ?? [])].some((neighborId) => attackerProvinceIds.has(neighborId)),
    )
    .map((province) => ({ province, score: scoreTargetProvince(world, province) }))
    .sort((a, b) => b.score - a.score || a.province.id.localeCompare(b.province.id))[0]?.province;
}

function pickRallyProvince(world: World, nationId: string, targetProvinceId: string) {
  const adjacency = buildProvinceAdjacency(world);
  const candidateIds = [...(adjacency.get(targetProvinceId) ?? [])].filter((provinceId) =>
    world.provinceById.get(provinceId)?.nationId === nationId,
  );

  return candidateIds
    .map((provinceId) => world.provinceById.get(provinceId))
    .filter((province): province is Province => Boolean(province))
    .sort((a, b) => scoreTargetProvince(world, b) - scoreTargetProvince(world, a))[0]?.id;
}

function findProvincePath(
  world: World,
  nationId: string,
  startProvinceId: string,
  destinationProvinceId: string,
) {
  if (startProvinceId === destinationProvinceId) {
    return [startProvinceId];
  }

  const adjacency = buildProvinceAdjacency(world);
  const frontier = [{ cost: 0, provinceId: startProvinceId }];
  const cameFrom = new Map<string, string>();
  const costSoFar = new Map<string, number>([[startProvinceId, 0]]);

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) {
      break;
    }
    if (current.provinceId === destinationProvinceId) {
      break;
    }

    for (const neighborId of adjacency.get(current.provinceId) ?? []) {
      const province = world.provinceById.get(neighborId);
      if (!province) {
        continue;
      }
      const isDestination = neighborId === destinationProvinceId;
      if (province.nationId !== nationId && !isDestination) {
        continue;
      }

      const newCost = current.cost + provincePathCost(world, neighborId) + (province.nationId === nationId ? 0 : 1);
      if (!costSoFar.has(neighborId) || newCost < (costSoFar.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        costSoFar.set(neighborId, newCost);
        cameFrom.set(neighborId, current.provinceId);
        frontier.push({ cost: newCost, provinceId: neighborId });
      }
    }
  }

  if (!cameFrom.has(destinationProvinceId)) {
    return [startProvinceId];
  }

  const path = [destinationProvinceId];
  let current = destinationProvinceId;
  while (current !== startProvinceId) {
    const previous = cameFrom.get(current);
    if (!previous) {
      return [startProvinceId];
    }
    path.push(previous);
    current = previous;
  }

  return path.reverse();
}

function provinceDistance(world: World, startProvinceId: string, destinationProvinceId: string) {
  if (startProvinceId === destinationProvinceId) {
    return 0;
  }

  const adjacency = buildProvinceAdjacency(world);
  const queue = [{ distance: 0, provinceId: startProvinceId }];
  const seen = new Set([startProvinceId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    for (const neighborId of adjacency.get(current.provinceId) ?? []) {
      if (neighborId === destinationProvinceId) {
        return current.distance + 1;
      }
      if (seen.has(neighborId)) {
        continue;
      }
      seen.add(neighborId);
      queue.push({ distance: current.distance + 1, provinceId: neighborId });
    }
  }

  return 99;
}

function provincePathCost(world: World, provinceId: string) {
  const terrainCounts = countProvinceTerrain(world, provinceId);
  const dominantTerrain = Object.entries(terrainCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as Terrain | undefined;

  switch (dominantTerrain) {
    case "mountain":
      return 4;
    case "forest":
    case "hill":
    case "desert":
      return 2;
    case "coast":
    case "plain":
    case "ocean":
    default:
      return 1;
  }
}

function provinceMovementCost(world: World, provinceId: string, units: ArmyUnits) {
  const baseCost = provincePathCost(world, provinceId);
  const heavyPenalty = units.heavyCavalry > totalUnits(units) * 0.35 && baseCost >= 2 ? 0.35 : 0;
  const lightCavalryBonus = units.lightCavalry > totalUnits(units) * 0.45 ? 0.25 : 0;

  return Math.max(0.75, baseCost + heavyPenalty - lightCavalryBonus);
}

function armyGroupSpeed(units: ArmyUnits) {
  const total = totalUnits(units);
  if (total === 0) {
    return 0;
  }

  const slowShare = (units.militia + units.infantry) / total;
  const lightCavalryShare = units.lightCavalry / total;
  return clamp(0.65 + lightCavalryShare * 1.1 - slowShare * 0.18, 0.45, 1.6);
}

function cityReserveTarget(city: { isCapital: boolean; level: number }) {
  return 22 + city.level * 12 + (city.isCapital ? 32 : 0);
}

function takeUnits(units: ArmyUnits, desiredAmount: number) {
  const total = totalUnits(units);
  if (total <= 0 || desiredAmount <= 0) {
    return emptyUnits();
  }

  const share = Math.min(1, desiredAmount / total);
  return {
    heavyCavalry: Math.floor(units.heavyCavalry * share),
    infantry: Math.floor(units.infantry * share),
    lightCavalry: Math.floor(units.lightCavalry * share),
    militia: Math.floor(units.militia * share),
  };
}

function subtractUnits(units: ArmyUnits, removed: ArmyUnits) {
  return {
    heavyCavalry: Math.max(0, units.heavyCavalry - removed.heavyCavalry),
    infantry: Math.max(0, units.infantry - removed.infantry),
    lightCavalry: Math.max(0, units.lightCavalry - removed.lightCavalry),
    militia: Math.max(0, units.militia - removed.militia),
  };
}

function addUnits(target: ArmyUnits, source: ArmyUnits) {
  for (const type of unitTypes) {
    target[type] += source[type];
  }
}

function cloneUnits(units: ArmyUnits) {
  return { ...units };
}

function distributeUnitsToCities(units: ArmyUnits, cities: Array<{ id: string; isCapital: boolean; level: number }>) {
  if (cities.length === 0) {
    return {};
  }

  const totalWeight = cities.reduce((sum, city) => sum + city.level + (city.isCapital ? 3 : 1), 0);
  const garrisons: Record<string, ArmyUnits> = {};

  for (const city of cities) {
    const weight = (city.level + (city.isCapital ? 3 : 1)) / totalWeight;
    garrisons[city.id] = {
      heavyCavalry: Math.round(units.heavyCavalry * weight),
      infantry: Math.round(units.infantry * weight),
      lightCavalry: Math.round(units.lightCavalry * weight),
      militia: Math.round(units.militia * weight),
    };
  }

  return garrisons;
}

function recalculateNationUnits(army: NationMilitary): NationMilitary {
  const units = emptyUnits();

  for (const garrison of Object.values(army.cityGarrisons)) {
    addUnits(units, garrison);
  }
  for (const group of army.armyGroups) {
    addUnits(units, group.units);
  }

  return {
    ...army,
    armyGroups: army.armyGroups.filter((group) => totalUnits(group.units) > 0),
    units,
  };
}

function getCityGarrisonSummaries(world: World, army: NationMilitary): CityGarrisonSummary[] {
  return Object.entries(army.cityGarrisons)
    .map(([cityId, units]) => {
      const city = world.cityById.get(cityId);
      const province = city ? world.provinceById.get(city.provinceId) : undefined;

      return {
        cityId,
        cityName: city?.name ?? cityId,
        provinceName: province?.name ?? "Unknown province",
        totalSoldiers: totalUnits(units),
        units,
      };
    })
    .filter((summary) => summary.totalSoldiers > 0)
    .sort((a, b) => b.totalSoldiers - a.totalSoldiers);
}

function formatArmyStance(stance: ArmyStance) {
  switch (stance) {
    case "attack":
      return "attack";
    case "defend":
      return "defense";
    case "garrison":
      return "garrison";
    case "raid":
      return "raiding";
    case "rally":
      return "rally";
    case "retreat":
      return "retreating";
  }
}

function resolveBattle({
  attackerNationId,
  attackerGroupIds,
  currentMonth,
  defenderNationId,
  defenderGroupIds,
  military,
  spyNetwork,
  targetProvince,
  war,
  world,
}: {
  attackerNationId: string;
  attackerGroupIds: string[];
  currentMonth: number;
  defenderNationId: string;
  defenderGroupIds: string[];
  military: MilitaryState;
  spyNetwork: SpyNetwork;
  targetProvince: Province;
  war: WarState;
  world: World;
}) {
  const attackerArmy = cloneArmy(military[attackerNationId] ?? {
    armyGroups: [],
    cityGarrisons: {},
    morale: 0.5,
    nationId: attackerNationId,
    recruitmentQueue: [],
    units: emptyUnits(),
  });
  const defenderArmy = cloneArmy(military[defenderNationId] ?? {
    armyGroups: [],
    cityGarrisons: {},
    morale: 0.5,
    nationId: defenderNationId,
    recruitmentQueue: [],
    units: emptyUnits(),
  });
  const attackerUnits = getEngagedUnits(world, attackerArmy, attackerGroupIds, targetProvince.id);
  const defenderUnits = getEngagedUnits(world, defenderArmy, defenderGroupIds, targetProvince.id);
  const defenderHasFieldOrGarrison = totalUnits(defenderUnits) > 0;
  const attackerHasFieldOrGarrison = totalUnits(attackerUnits) > 0;

  if (!defenderHasFieldOrGarrison && targetProvince.nationId === defenderNationId) {
    defenderUnits.militia = Math.max(defenderUnits.militia, Math.round(targetProvince.tileCount * 0.6));
  }
  if (!attackerHasFieldOrGarrison && targetProvince.nationId === attackerNationId) {
    attackerUnits.militia = Math.max(attackerUnits.militia, Math.round(targetProvince.tileCount * 0.6));
  }

  const terrainBonus = provinceDefenseBonus(world, targetProvince.id);
  const cityBonus = world.cities.some((city) => city.provinceId === targetProvince.id) ? 1.2 : 1;
  const intelBonus = hasActiveIntelligence(spyNetwork, attackerNationId, defenderNationId, currentMonth)
    ? 1.08
    : 1;
  const attackRoll = 0.88 + seededRandom(world.seed, `${war.id}:attack:${targetProvince.id}`, currentMonth) * 0.24;
  const defenseRoll = 0.9 + seededRandom(world.seed, `${war.id}:defense:${targetProvince.id}`, currentMonth) * 0.2;
  const mobilityBonus = 1 + averageSpeed(attackerUnits) * 0.035;
  const attackerPower =
    calculateUnitsAttackPower(attackerUnits) *
    attackerArmy.morale *
    mobilityBonus *
    intelBonus *
    attackRoll;
  const defenderPower =
    calculateUnitsDefensePower(defenderUnits) *
    defenderArmy.morale *
    terrainBonus *
    cityBonus *
    defenseRoll;
  const attackerWon = attackerPower > defenderPower * 1.04;
  const powerRatio = attackerWon
    ? defenderPower / Math.max(1, attackerPower)
    : attackerPower / Math.max(1, defenderPower);
  const winnerLossRate = clamp(0.045 + powerRatio * 0.06, 0.04, 0.13);
  const loserLossRate = clamp(0.095 + (1 - powerRatio) * 0.09, 0.09, 0.22);

  applyEngagementLosses(world, attackerArmy, attackerGroupIds, targetProvince.id, attackerWon ? winnerLossRate : loserLossRate);
  applyEngagementLosses(world, defenderArmy, defenderGroupIds, targetProvince.id, attackerWon ? loserLossRate : winnerLossRate);
  if (attackerWon) {
    retreatGroups(world, defenderArmy, defenderGroupIds, targetProvince.id, currentMonth);
  } else {
    retreatGroups(world, attackerArmy, attackerGroupIds, targetProvince.id, currentMonth);
  }
  attackerArmy.morale = clamp(attackerArmy.morale + (attackerWon ? 0.035 : -0.05), 0.25, 1);
  defenderArmy.morale = clamp(defenderArmy.morale + (attackerWon ? -0.055 : 0.03), 0.25, 1);

  const event = buildWarEvent({
    currentMonth,
    description: `${nationName(world, attackerNationId)} ${attackerWon ? "won" : "failed"} the battle for ${targetProvince.name} against ${nationName(world, defenderNationId)}. Attack ${Math.round(attackerPower)}, defense ${Math.round(defenderPower)}.`,
    id: `event-battle-${war.id}-${targetProvince.id}-${currentMonth}`,
    kind: "battle_fought",
    nationIds: [attackerNationId, defenderNationId],
    title: attackerWon ? "Battle Won" : "Battle Held",
  });

  return {
    attackerArmy: recalculateNationUnits(attackerArmy),
    attackerWon,
    defenderArmy: recalculateNationUnits(defenderArmy),
    event,
  };
}

function transferProvince(
  world: World,
  provinceId: string,
  newNationId: string,
  oldNationId: string,
  currentMonth: number,
) {
  const province = world.provinceById.get(provinceId);
  const capturedCities = world.cities.filter((city) => city.provinceId === provinceId);
  const events: GameEvent[] = [];

  if (!province) {
    return { capturedCities, events };
  }

  province.nationId = newNationId;
  events.push(buildWarEvent({
    currentMonth,
    description: `${nationName(world, newNationId)} occupied ${province.name}, taking control of its land and resources from ${nationName(world, oldNationId)}.`,
    id: `event-province-occupied-${provinceId}-${newNationId}-${currentMonth}`,
    kind: "province_occupied",
    nationIds: [newNationId, oldNationId],
    title: "Province Occupied",
  }));

  for (const city of capturedCities) {
    const wasCapital = city.isCapital || world.nationById.get(oldNationId)?.capitalCityId === city.id;
    city.nationId = newNationId;
    city.isCapital = false;
    events.push(buildWarEvent({
      currentMonth,
      description: `${nationName(world, oldNationId)} lost ${city.name}${wasCapital ? ", its capital city," : ""} to ${nationName(world, newNationId)}.`,
      id: `event-city-lost-${city.id}-${oldNationId}-${currentMonth}`,
      kind: "city_lost",
      nationIds: [newNationId, oldNationId],
      title: wasCapital ? "Capital Lost" : "City Lost",
    }));
  }

  normalizeNationCapitals(world);
  rebuildNationEdges(world);

  return { capturedCities, events };
}

function removeCapturedCityGarrisons(
  military: MilitaryState,
  capturedCities: Array<{ id: string }>,
  oldNationId: string,
) {
  const army = military[oldNationId];
  if (!army) {
    return;
  }

  for (const city of capturedCities) {
    delete army.cityGarrisons[city.id];
  }
  military[oldNationId] = recalculateNationUnits(army);
}

function pickTargetProvince(world: World, attackerNationId: string, defenderNationId: string) {
  const adjacency = buildProvinceAdjacency(world);
  const attackerProvinceIds = new Set(
    world.provinces
      .filter((province) => province.nationId === attackerNationId)
      .map((province) => province.id),
  );
  const targets = world.provinces.filter((province) => {
    if (province.nationId !== defenderNationId) {
      return false;
    }

    return [...(adjacency.get(province.id) ?? [])].some((neighborId) => attackerProvinceIds.has(neighborId));
  });

  return targets
    .map((province) => ({ province, score: scoreTargetProvince(world, province) }))
    .sort((a, b) => b.score - a.score || a.province.id.localeCompare(b.province.id))[0]?.province;
}

function scoreTargetProvince(world: World, province: Province) {
  const cities = world.cities.filter((city) => city.provinceId === province.id);
  const resources = world.tiles.filter((tile) => tile.provinceId === province.id && tile.resource).length;
  const capitalBonus = cities.some((city) => city.isCapital) ? 180 : 0;
  const cityScore = cities.reduce((sum, city) => sum + city.level * 35 + city.population / 1200, 0);

  return province.tileCount + resources * 22 + cityScore + capitalBonus;
}

function provinceDefenseBonus(world: World, provinceId: string) {
  const terrainCounts = countProvinceTerrain(world, provinceId);
  const dominantTerrain = Object.entries(terrainCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as Terrain | undefined;

  switch (dominantTerrain) {
    case "mountain":
      return 1.32;
    case "hill":
      return 1.22;
    case "forest":
      return 1.16;
    case "desert":
      return 1.06;
    case "coast":
      return 1.08;
    case "plain":
    case "ocean":
    default:
      return 1;
  }
}

function countProvinceTerrain(world: World, provinceId: string) {
  return world.tiles.reduce<Partial<Record<Terrain, number>>>((counts, tile) => {
    if (tile.provinceId !== provinceId) {
      return counts;
    }

    counts[tile.terrain] = (counts[tile.terrain] ?? 0) + 1;
    return counts;
  }, {});
}

function buildProvinceAdjacency(world: World) {
  const tileByCoord = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const adjacency = new Map<string, Set<string>>();

  for (const tile of world.tiles) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const neighbor = tileByCoord.get(`${tile.x + dx},${tile.y + dy}`);
      if (!tile.provinceId || !neighbor?.provinceId || tile.provinceId === neighbor.provinceId) {
        continue;
      }

      addAdjacency(adjacency, tile.provinceId, neighbor.provinceId);
      addAdjacency(adjacency, neighbor.provinceId, tile.provinceId);
    }
  }

  return adjacency;
}

function addAdjacency(adjacency: Map<string, Set<string>>, provinceId: string, neighborId: string) {
  const neighbors = adjacency.get(provinceId) ?? new Set<string>();
  neighbors.add(neighborId);
  adjacency.set(provinceId, neighbors);
}

function rebuildNationEdges(world: World) {
  const tileByCoord = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const nationEdges = [];

  for (const tile of world.tiles) {
    const right = tileByCoord.get(`${tile.x + 1},${tile.y}`);
    const down = tileByCoord.get(`${tile.x},${tile.y + 1}`);
    addNationBorderBetween(world, tile, right, "vertical", nationEdges);
    addNationBorderBetween(world, tile, down, "horizontal", nationEdges);

    if (tile.x === 0 && tile.provinceId) {
      nationEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x, y2: tile.y + 1, nationId: provinceNationId(world, tile) });
    }
    if (tile.y === 0 && tile.provinceId) {
      nationEdges.push({ x1: tile.x, y1: tile.y, x2: tile.x + 1, y2: tile.y, nationId: provinceNationId(world, tile) });
    }
    if (tile.x === world.width - 1 && tile.provinceId) {
      nationEdges.push({ x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1, nationId: provinceNationId(world, tile) });
    }
    if (tile.y === world.height - 1 && tile.provinceId) {
      nationEdges.push({ x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1, nationId: provinceNationId(world, tile) });
    }
  }

  world.nationEdges.splice(0, world.nationEdges.length, ...nationEdges);
}

function addNationBorderBetween(
  world: World,
  tile: Tile,
  neighbor: Tile | undefined,
  direction: "horizontal" | "vertical",
  nationEdges: World["nationEdges"],
) {
  if (!neighbor) {
    return;
  }

  const tileNationId = provinceNationId(world, tile);
  const neighborNationId = provinceNationId(world, neighbor);
  if (tileNationId === neighborNationId) {
    return;
  }

  const edge = direction === "vertical"
    ? { x1: tile.x + 1, y1: tile.y, x2: tile.x + 1, y2: tile.y + 1 }
    : { x1: tile.x, y1: tile.y + 1, x2: tile.x + 1, y2: tile.y + 1 };
  nationEdges.push({ ...edge, nationId: tileNationId ?? neighborNationId });
}

function provinceNationId(world: World, tile: Tile) {
  return tile.provinceId ? world.provinceById.get(tile.provinceId)?.nationId : undefined;
}

function normalizeNationCapitals(world: World) {
  for (const nation of world.nations) {
    const cities = world.cities
      .filter((city) => city.nationId === nation.id)
      .sort((a, b) => b.population - a.population);
    if (cities.length === 0) {
      const fallbackProvince = world.provinces.find((province) => province.nationId === nation.id);
      nation.capitalCityId = undefined;
      nation.capitalProvinceId = fallbackProvince?.id ?? nation.capitalProvinceId;
      continue;
    }

    const currentCapital = cities.find((city) => city.id === nation.capitalCityId && city.isCapital);
    const capital = currentCapital ?? cities[0];
    for (const city of cities) {
      city.isCapital = city.id === capital.id;
    }
    nation.capitalCityId = capital.id;
    nation.capitalProvinceId = capital.provinceId;
  }
}

function buildTrucesForEndedEvents(events: GameEvent[], currentMonth: number) {
  return events
    .filter((event) => event.kind === "war_ended" && event.nationIds.length >= 2)
    .map((event) => ({
      expiresAtMonth: currentMonth + truceAfterWarMonths,
      id: `truce-${relationKey(event.nationIds[0], event.nationIds[1])}-${currentMonth}`,
      nationAId: event.nationIds[0],
      nationBId: event.nationIds[1],
      signedAtMonth: currentMonth,
    }));
}

function worsenRelationToAtMost(
  relations: NationRelations,
  nationAId: string,
  nationBId: string,
  maxAttitude: number,
  currentMonth: number,
) {
  const relation = getNationRelation(relations, nationAId, nationBId);
  if (!relation || relation.attitude <= maxAttitude) {
    return relations;
  }

  return adjustNationRelation(
    relations,
    nationAId,
    nationBId,
    maxAttitude - relation.attitude,
    currentMonth,
  );
}

function shouldEndWar(war: WarState, attackerArmy: NationMilitary, defenderArmy: NationMilitary) {
  if (totalUnits(attackerArmy.units) < 45 || totalUnits(defenderArmy.units) < 45) {
    return true;
  }

  return (war.battleCount ?? 0) >= 5 && Math.abs((war.attackerScore ?? 0) - (war.defenderScore ?? 0)) >= 3;
}

function dedupeWars(wars: WarState[]) {
  const seen = new Set<string>();
  return wars.filter((war) => {
    const key = relationKey(war.attackerNationId, war.defenderNationId);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hasActiveIntelligence(
  spyNetwork: SpyNetwork,
  ownerNationId: string,
  targetNationId: string,
  currentMonth: number,
) {
  return spyNetwork.intelligenceReports.some((report) =>
    report.ownerNationId === ownerNationId &&
    report.targetNationId === targetNationId &&
    (report.expiresAtMonth === undefined || report.expiresAtMonth > currentMonth),
  );
}

function nationExists(world: World, nationId: string) {
  return world.provinces.some((province) => province.nationId === nationId);
}

function cloneMilitary(military: MilitaryState): MilitaryState {
  return Object.fromEntries(
    Object.entries(military).map(([nationId, army]) => [nationId, cloneArmy(army)]),
  );
}

function cloneArmy(army: NationMilitary): NationMilitary {
  return {
    ...army,
    armyGroups: army.armyGroups.map((group) => ({
      ...group,
      pathProvinceIds: [...group.pathProvinceIds],
      units: { ...group.units },
    })),
    cityGarrisons: Object.fromEntries(
      Object.entries(army.cityGarrisons).map(([cityId, units]) => [cityId, { ...units }]),
    ),
    recruitmentQueue: army.recruitmentQueue.map((order) => ({ ...order })),
    units: { ...army.units },
  };
}

function emptyUnits(): ArmyUnits {
  return {
    heavyCavalry: 0,
    infantry: 0,
    lightCavalry: 0,
    militia: 0,
  };
}

function calculateArmyAttackPower(army: NationMilitary) {
  return calculateUnitsAttackPower(army.units);
}

function calculateArmyDefensePower(army: NationMilitary) {
  return calculateUnitsDefensePower(army.units);
}

function calculateUnitsAttackPower(units: ArmyUnits) {
  return unitTypes.reduce((sum, type) => sum + units[type] * unitStats[type].attack, 0);
}

function calculateUnitsDefensePower(units: ArmyUnits) {
  return unitTypes.reduce((sum, type) => sum + units[type] * unitStats[type].defense, 0);
}

function calculateMonthlyUpkeep(units: ArmyUnits) {
  return unitTypes.reduce((sum, type) => sum + units[type] * unitStats[type].upkeepGold, 0);
}

function totalUnits(units: ArmyUnits) {
  return unitTypes.reduce((sum, type) => sum + units[type], 0);
}

function disbandUnits(army: NationMilitary, amount: number, typeOrder: UnitType[]) {
  const nextArmy = cloneArmy(army);
  const removed = emptyUnits();
  let remaining = amount;

  for (const type of typeOrder) {
    if (remaining <= 0) {
      break;
    }

    const removable = Math.min(remaining, nextArmy.units[type]);
    if (removable <= 0) {
      continue;
    }

    removed[type] = removeUnitTypeFromArmy(nextArmy, type, removable);
    remaining -= removed[type];
  }

  return {
    army: recalculateNationUnits(nextArmy),
    removed,
  };
}

function removeUnitTypeFromArmy(army: NationMilitary, unitType: UnitType, amount: number) {
  let remaining = amount;
  let removed = 0;

  for (const [cityId, garrison] of Object.entries(army.cityGarrisons)) {
    if (remaining <= 0) {
      break;
    }
    const removedFromGarrison = Math.min(remaining, garrison[unitType]);
    garrison[unitType] -= removedFromGarrison;
    remaining -= removedFromGarrison;
    removed += removedFromGarrison;
    army.cityGarrisons[cityId] = garrison;
  }

  for (const group of army.armyGroups) {
    if (remaining <= 0) {
      break;
    }
    const removedFromGroup = Math.min(remaining, group.units[unitType]);
    group.units[unitType] -= removedFromGroup;
    remaining -= removedFromGroup;
    removed += removedFromGroup;
  }

  return removed;
}

function averageSpeed(units: ArmyUnits) {
  const total = totalUnits(units);
  if (total === 0) {
    return 0;
  }

  return unitTypes.reduce((sum, type) => sum + units[type] * unitStats[type].speed, 0) / total;
}

function applyLosses(units: ArmyUnits, lossRate: number) {
  for (const type of unitTypes) {
    const typeLossRate = type === "militia"
      ? lossRate * 1.2
      : type === "heavyCavalry"
        ? lossRate * 0.72
        : lossRate;
    units[type] = Math.max(0, units[type] - Math.ceil(units[type] * typeLossRate));
  }
}

function applyLossesToMilitary(army: NationMilitary, lossRate: number) {
  for (const group of army.armyGroups) {
    applyLosses(group.units, lossRate * 1.08);
  }

  for (const [cityId, garrison] of Object.entries(army.cityGarrisons)) {
    army.cityGarrisons[cityId] = applyLossesCopy(garrison, lossRate * 0.82);
  }

  const recalculated = recalculateNationUnits(army);
  army.units = recalculated.units;
  army.armyGroups = recalculated.armyGroups;
}

function applyLossesCopy(units: ArmyUnits, lossRate: number) {
  const next = cloneUnits(units);
  applyLosses(next, lossRate);
  return next;
}

function getEngagedUnits(
  world: World,
  army: NationMilitary,
  groupIds: string[],
  provinceId: string,
) {
  const units = emptyUnits();
  const groupIdSet = new Set(groupIds);

  for (const group of army.armyGroups) {
    if (groupIdSet.has(group.id)) {
      addUnits(units, group.units);
    }
  }

  for (const city of world.cities) {
    if (city.nationId !== army.nationId || city.provinceId !== provinceId) {
      continue;
    }
    addUnits(units, army.cityGarrisons[city.id] ?? emptyUnits());
  }

  return units;
}

function applyEngagementLosses(
  world: World,
  army: NationMilitary,
  groupIds: string[],
  provinceId: string,
  lossRate: number,
) {
  const groupIdSet = new Set(groupIds);
  for (const group of army.armyGroups) {
    if (groupIdSet.has(group.id)) {
      applyLosses(group.units, lossRate * 1.08);
      if (totalUnits(group.units) <= 8) {
        group.units = emptyUnits();
      }
    }
  }

  for (const city of world.cities) {
    if (city.nationId !== army.nationId || city.provinceId !== provinceId) {
      continue;
    }
    army.cityGarrisons[city.id] = applyLossesCopy(
      army.cityGarrisons[city.id] ?? emptyUnits(),
      lossRate * 0.82,
    );
  }

  const recalculated = recalculateNationUnits(army);
  army.units = recalculated.units;
  army.armyGroups = recalculated.armyGroups;
}

function retreatGroups(
  world: World,
  army: NationMilitary,
  groupIds: string[],
  fromProvinceId: string,
  currentMonth: number,
) {
  if (groupIds.length === 0) {
    return;
  }

  const retreatProvinceId = pickRetreatProvince(world, army.nationId, fromProvinceId);
  if (!retreatProvinceId) {
    return;
  }

  const groupIdSet = new Set(groupIds);
  for (const group of army.armyGroups) {
    if (!groupIdSet.has(group.id) || totalUnits(group.units) <= 0) {
      continue;
    }

    group.destinationProvinceId = retreatProvinceId;
    group.locationProvinceId = retreatProvinceId;
    group.movementProgress = 0;
    group.pathProvinceIds = [];
    group.stance = "retreat";
    group.updatedAtMonth = currentMonth;
  }
}

function pickRetreatProvince(world: World, nationId: string, fromProvinceId: string) {
  const adjacency = buildProvinceAdjacency(world);
  const candidates = [...(adjacency.get(fromProvinceId) ?? [])]
    .map((provinceId) => world.provinceById.get(provinceId))
    .filter((province): province is Province => province?.nationId === nationId);

  return candidates
    .sort((a, b) => scoreTargetProvince(world, b) - scoreTargetProvince(world, a))[0]?.id;
}

function seededRandom(seed: string, salt: string, currentMonth: number) {
  let hash = 2166136261;
  const value = `${seed}:${salt}:${currentMonth}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildWarEvent({ currentMonth, ...event }: Omit<GameEvent, "month"> & { currentMonth: number }): GameEvent {
  return {
    ...event,
    month: currentMonth,
  };
}

function nationName(world: World, nationId: string) {
  return world.nationById.get(nationId)?.name ?? nationId;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
