import { calculateNationCityEconomy } from "./cityEconomy";
import { resourceTypes } from "./economy";
import { getNationRelationsFor, otherNationId, type NationRelations } from "./relationships";
import { calculateNationMonthlyIncome, type NationStockpiles } from "./settlement";
import type { Resource, World } from "./types";

export const policyDecisionIntervalMonths = 6;

export type ExpansionPolicy = "none" | "control_city" | "control_resource" | "decisive_battle";
export type EconomyPolicy = "construction" | "recovery" | "army_building";
export type DiplomacyPolicy =
  | "none"
  | "declare_war"
  | "demand_vassalage"
  | "seek_alliance"
  | "seek_peace"
  | "seek_vassalage"
  | "surrender";
export type SpyMissionPolicy =
  | "damage_relations"
  | "gather_intelligence"
  | "improve_relations"
  | "sow_discord";

export type PolicyDirection<TPolicy extends string> = {
  policy: TPolicy;
  label: string;
  rationale: string;
  targetNationId?: string;
  targetResource?: Resource;
};

export type SpyMissionIntent = PolicyDirection<SpyMissionPolicy> & {
  id: string;
  secondaryTargetNationId?: string;
};

export type NationPolicyState = {
  expansion: PolicyDirection<ExpansionPolicy>;
  economy: PolicyDirection<EconomyPolicy>;
  diplomacy: PolicyDirection<DiplomacyPolicy>;
  spyMissions: SpyMissionIntent[];
  decidedAtMonth: number;
  nextDecisionMonth: number;
};

export type NationPolicies = Record<string, NationPolicyState>;

const expansionLabels: Record<ExpansionPolicy, string> = {
  control_city: "Control Cities",
  control_resource: "Control Resources",
  decisive_battle: "Decisive Battle",
  none: "No Expansion",
};

const economyLabels: Record<EconomyPolicy, string> = {
  army_building: "Army Building",
  construction: "Construction",
  recovery: "Recovery",
};

const diplomacyLabels: Record<DiplomacyPolicy, string> = {
  declare_war: "Declare War",
  demand_vassalage: "Demand Vassalage",
  none: "No Diplomatic Move",
  seek_alliance: "Seek Alliance",
  seek_peace: "Seek Peace",
  seek_vassalage: "Seek Vassalage",
  surrender: "Surrender",
};

const spyMissionLabels: Record<SpyMissionPolicy, string> = {
  damage_relations: "Damage Relations",
  gather_intelligence: "Gather Intelligence",
  improve_relations: "Improve Relations",
  sow_discord: "Sow Discord",
};

export function buildInitialNationPolicies(
  world: World,
  relations: NationRelations,
  stockpiles: NationStockpiles,
  currentMonth: number,
): NationPolicies {
  return Object.fromEntries(
    world.nations.map((nation) => [
      nation.id,
      decideNationPolicy(world, relations, stockpiles, nation.id, currentMonth),
    ]),
  );
}

export function advanceNationPolicies(
  world: World,
  relations: NationRelations,
  stockpiles: NationStockpiles,
  currentPolicies: NationPolicies,
  fromMonth: number,
  toMonth: number,
): NationPolicies {
  let changed = false;
  const nextPolicies = { ...currentPolicies };

  for (const nation of world.nations) {
    const currentPolicy =
      nextPolicies[nation.id] ??
      decideNationPolicy(world, relations, stockpiles, nation.id, fromMonth);

    if (toMonth < currentPolicy.nextDecisionMonth) {
      nextPolicies[nation.id] = currentPolicy;
      continue;
    }

    nextPolicies[nation.id] = decideNationPolicy(world, relations, stockpiles, nation.id, toMonth);
    changed = true;
  }

  return changed ? nextPolicies : currentPolicies;
}

function decideNationPolicy(
  world: World,
  relations: NationRelations,
  stockpiles: NationStockpiles,
  nationId: string,
  currentMonth: number,
): NationPolicyState {
  const profile = buildNationPolicyProfile(world, relations, stockpiles, nationId);

  return {
    expansion: decideExpansion(profile),
    economy: decideEconomy(profile),
    diplomacy: decideDiplomacy(profile),
    spyMissions: decideSpyMissions(profile),
    decidedAtMonth: currentMonth,
    nextDecisionMonth: currentMonth + policyDecisionIntervalMonths,
  };
}

function buildNationPolicyProfile(
  world: World,
  relations: NationRelations,
  stockpiles: NationStockpiles,
  nationId: string,
) {
  const provinces = world.provinces.filter((province) => province.nationId === nationId);
  const cities = world.cities.filter((city) => city.nationId === nationId);
  const economy = calculateNationCityEconomy(nationId, world);
  const income = calculateNationMonthlyIncome(world, nationId);
  const stockpile = stockpiles[nationId] ?? { gold: 0, resources: {} };
  const relationList = getNationRelationsFor(relations, nationId);
  const hostileRelations = relationList.filter((relation) => relation.attitude <= -25);
  const friendlyRelations = relationList.filter((relation) => relation.attitude >= 25);
  const worstRelation = relationList[0];
  const bestRelation = [...relationList].sort((a, b) => b.attitude - a.attitude)[0];
  const resourceDiversity = resourceTypes.filter((resource) => (income.resources[resource] ?? 0) > 0).length;
  const lowestResource = [...resourceTypes].sort(
    (a, b) => (stockpile.resources[a] ?? 0) + (income.resources[a] ?? 0) * 6 -
      ((stockpile.resources[b] ?? 0) + (income.resources[b] ?? 0) * 6),
  )[0];
  const openBuildingSlots = cities.reduce((sum, city) => sum + (city.isCapital ? 12 : 8), 0);
  const armyPerThousand = economy.population > 0 ? economy.army / (economy.population / 1000) : 0;
  const strength = economy.army + economy.monthlyGold * 18 + economy.population / 18 + stockpile.gold / 2;

  return {
    armyPerThousand,
    bestRelation,
    cities,
    economy,
    friendlyRelations,
    hostileRelations,
    income,
    lowestResource,
    nationId,
    openBuildingSlots,
    provinces,
    relationList,
    resourceDiversity,
    stockpile,
    strength,
    worstRelation,
  };
}

function decideExpansion(profile: ReturnType<typeof buildNationPolicyProfile>): PolicyDirection<ExpansionPolicy> {
  if (profile.hostileRelations.length === 0 || profile.armyPerThousand < 18) {
    return {
      policy: "none",
      label: expansionLabels.none,
      rationale: "No immediate hostile target or insufficient army density.",
    };
  }

  const targetNationId = otherNationId(profile.worstRelation, profile.nationId);

  if (profile.resourceDiversity < 4) {
    return {
      policy: "control_resource",
      label: expansionLabels.control_resource,
      rationale: `Resource diversity is ${profile.resourceDiversity}/5, so expansion favors missing supplies.`,
      targetNationId,
      targetResource: profile.lowestResource,
    };
  }

  if (profile.cities.length < Math.max(3, Math.floor(profile.provinces.length / 7))) {
    return {
      policy: "control_city",
      label: expansionLabels.control_city,
      rationale: "Urban control is low compared with territorial size.",
      targetNationId,
    };
  }

  return {
    policy: "decisive_battle",
    label: expansionLabels.decisive_battle,
    rationale: "The army is dense enough to seek a direct confrontation.",
    targetNationId,
  };
}

function decideEconomy(profile: ReturnType<typeof buildNationPolicyProfile>): PolicyDirection<EconomyPolicy> {
  if (profile.stockpile.gold < profile.income.gold * 2 || profile.resourceDiversity <= 2) {
    return {
      policy: "recovery",
      label: economyLabels.recovery,
      rationale: "Reserves are thin, so the economy is conserving gold and resources.",
    };
  }

  if (profile.armyPerThousand < 26 || profile.hostileRelations.length >= 2) {
    return {
      policy: "army_building",
      label: economyLabels.army_building,
      rationale: `Army density is ${profile.armyPerThousand.toFixed(1)} per 1K population.`,
    };
  }

  return {
    policy: "construction",
    label: economyLabels.construction,
    rationale: `${profile.openBuildingSlots} empty building slots are available.`,
  };
}

function decideDiplomacy(profile: ReturnType<typeof buildNationPolicyProfile>): PolicyDirection<DiplomacyPolicy> {
  if (profile.worstRelation && profile.worstRelation.attitude <= -70 && profile.armyPerThousand < 12) {
    return {
      policy: "seek_vassalage",
      label: diplomacyLabels.seek_vassalage,
      rationale: "Severe hostility and weak army density make protection attractive.",
      targetNationId: otherNationId(profile.worstRelation, profile.nationId),
    };
  }

  if (profile.worstRelation && profile.worstRelation.attitude <= -55 && profile.armyPerThousand >= 30) {
    return {
      policy: "declare_war",
      label: diplomacyLabels.declare_war,
      rationale: "Hostility is high and military readiness is strong.",
      targetNationId: otherNationId(profile.worstRelation, profile.nationId),
    };
  }

  if (profile.bestRelation && profile.bestRelation.attitude >= 35) {
    return {
      policy: "seek_alliance",
      label: diplomacyLabels.seek_alliance,
      rationale: "A friendly partner is available for future mutual defense.",
      targetNationId: otherNationId(profile.bestRelation, profile.nationId),
    };
  }

  if (profile.worstRelation && profile.worstRelation.attitude <= -35 && profile.strength > 9000) {
    return {
      policy: "demand_vassalage",
      label: diplomacyLabels.demand_vassalage,
      rationale: "The nation is strong enough to pressure a weaker rival.",
      targetNationId: otherNationId(profile.worstRelation, profile.nationId),
    };
  }

  return {
    policy: "none",
    label: diplomacyLabels.none,
    rationale: "No diplomatic action has a strong enough advantage yet.",
  };
}

function decideSpyMissions(profile: ReturnType<typeof buildNationPolicyProfile>): SpyMissionIntent[] {
  const missions: SpyMissionIntent[] = [];
  const addMission = (mission: Omit<SpyMissionIntent, "id">) => {
    if (missions.length >= 3) {
      return;
    }

    missions.push({
      ...mission,
      id: `${profile.nationId}-spy-${missions.length}`,
    });
  };

  if (profile.worstRelation && profile.worstRelation.attitude <= -35) {
    addMission({
      policy: "gather_intelligence",
      label: spyMissionLabels.gather_intelligence,
      rationale: "The most hostile nation should be watched first.",
      targetNationId: otherNationId(profile.worstRelation, profile.nationId),
    });
  }

  if (profile.hostileRelations.length >= 2) {
    addMission({
      policy: "sow_discord",
      label: spyMissionLabels.sow_discord,
      rationale: "Multiple hostile neighbors make rivalry manipulation valuable.",
      targetNationId: otherNationId(profile.hostileRelations[0], profile.nationId),
      secondaryTargetNationId: otherNationId(profile.hostileRelations[1], profile.nationId),
    });
  }

  if (profile.bestRelation && profile.bestRelation.attitude >= 20 && profile.bestRelation.attitude < 60) {
    addMission({
      policy: "improve_relations",
      label: spyMissionLabels.improve_relations,
      rationale: "A promising partner can be nudged toward closer cooperation.",
      targetNationId: otherNationId(profile.bestRelation, profile.nationId),
    });
  }

  const merelyWaryRelation = profile.relationList.find(
    (relation) => relation.attitude > -35 && relation.attitude <= -15,
  );
  if (merelyWaryRelation) {
    addMission({
      policy: "damage_relations",
      label: spyMissionLabels.damage_relations,
      rationale: "A wary rival can be contained by worsening its external relations.",
      targetNationId: otherNationId(merelyWaryRelation, profile.nationId),
    });
  }

  return missions;
}
