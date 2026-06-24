import { calculateNationCityEconomy } from "./cityEconomy";
import { type ResourceTotals } from "./economy";
import type { GameEvent } from "./events";
import type { NationPolicies, SpyMissionIntent, SpyMissionPolicy } from "./policyAI";
import { adjustNationRelation, type NationRelations } from "./relationships";
import { calculateNationMonthlyIncome } from "./settlement";
import type { World } from "./types";

export type SpyOperationStatus = "deploying" | "active" | "expired";

export type Spy = {
  id: string;
  nationId: string;
  slot: number;
};

export type SpyOperation = {
  id: string;
  spyId: string;
  ownerNationId: string;
  policy: SpyMissionPolicy;
  targetNationId: string;
  secondaryTargetNationId?: string;
  startedAtMonth: number;
  activatesAtMonth: number;
  expiresAtMonth: number;
  status: SpyOperationStatus;
};

export type IntelligenceReport = {
  id: string;
  operationId: string;
  ownerNationId: string;
  targetNationId: string;
  acquiredAtMonth: number;
  expiresAtMonth?: number;
  army: number;
  monthlyGold: number;
  monthlyResources: ResourceTotals;
};

export type SpyNetwork = {
  spies: Spy[];
  operations: SpyOperation[];
  intelligenceReports: IntelligenceReport[];
};

export type SpyUpdate = {
  spyNetwork: SpyNetwork;
  relations: NationRelations;
  events: GameEvent[];
};

export type NationSpySummary = {
  deployed: SpyOperation[];
  intelligenceReports: IntelligenceReport[];
};

const spyCapacity = 3;
const intelligenceLeadMonths = 6;
const staleIntelligenceMonths = 4;
const missionReviewMonths = 6;
const relationEffectIntervalMonths = 3;

export function buildInitialSpyNetwork(world: World, policies: NationPolicies): SpyNetwork {
  const spies = world.nations.flatMap((nation) =>
    Array.from({ length: spyCapacity }, (_, slot) => ({
      id: `${nation.id}-spy-${slot + 1}`,
      nationId: nation.id,
      slot: slot + 1,
    })),
  );

  const network: SpyNetwork = { intelligenceReports: [], operations: [], spies };
  return assignSpyMissions(network, policies, world, 0).spyNetwork;
}

export function buildInitialSpyNetworkWithEvents(world: World, policies: NationPolicies) {
  const spies = world.nations.flatMap((nation) =>
    Array.from({ length: spyCapacity }, (_, slot) => ({
      id: `${nation.id}-spy-${slot + 1}`,
      nationId: nation.id,
      slot: slot + 1,
    })),
  );

  return assignSpyMissions({ intelligenceReports: [], operations: [], spies }, policies, world, 0);
}

export function advanceSpyNetwork(
  spyNetwork: SpyNetwork,
  policies: NationPolicies,
  relations: NationRelations,
  world: World,
  currentMonth: number,
): SpyUpdate {
  let next = refreshOperationStatuses(spyNetwork, currentMonth);
  const execution = executeActiveSpyMissions(next, relations, world, currentMonth);
  next = execution.spyNetwork;
  const assignment = isPolicyReviewMonth(policies, currentMonth)
    ? assignSpyMissions(next, policies, world, currentMonth)
    : { events: [], spyNetwork: next };

  return {
    events: [...execution.events, ...assignment.events],
    relations: execution.relations,
    spyNetwork: assignment.spyNetwork,
  };
}

export function getNationSpySummary(
  spyNetwork: SpyNetwork,
  nationId: string,
  currentMonth: number,
): NationSpySummary {
  return {
    deployed: spyNetwork.operations.filter(
      (operation) => operation.ownerNationId === nationId && operation.status !== "expired",
    ),
    intelligenceReports: spyNetwork.intelligenceReports.filter(
      (report) => report.ownerNationId === nationId && (report.expiresAtMonth === undefined || report.expiresAtMonth > currentMonth),
    ),
  };
}

export function formatSpyMissionPolicy(policy: SpyMissionPolicy) {
  switch (policy) {
    case "damage_relations":
      return "Damage Relations";
    case "gather_intelligence":
      return "Gather Intelligence";
    case "improve_relations":
      return "Improve Relations";
    case "sow_discord":
      return "Sow Discord";
  }
}

function assignSpyMissions(
  spyNetwork: SpyNetwork,
  policies: NationPolicies,
  world: World,
  currentMonth: number,
) {
  let operations = spyNetwork.operations.map((operation) => ({ ...operation }));
  let reports = spyNetwork.intelligenceReports.map((report) => ({ ...report }));
  const events: GameEvent[] = [];

  for (const nation of world.nations) {
    const desiredMissions = (policies[nation.id]?.spyMissions ?? []).slice(0, spyCapacity);
    const nationSpies = spyNetwork.spies.filter((spy) => spy.nationId === nation.id);
    const activeOperations = operations.filter(
      (operation) => operation.ownerNationId === nation.id && operation.status !== "expired",
    );
    const retainedOperationIds = new Set<string>();

    desiredMissions.forEach((mission, index) => {
      const existing = activeOperations.find((operation) =>
        !retainedOperationIds.has(operation.id) && sameMission(operation, mission),
      );
      if (existing) {
        existing.expiresAtMonth = currentMonth + missionReviewMonths;
        retainedOperationIds.add(existing.id);
        return;
      }

      const spy = nationSpies[index];
      if (!spy) {
        return;
      }
      const replaced = activeOperations.find((operation) => operation.spyId === spy.id);
      if (replaced) {
        replaced.status = "expired";
        replaced.expiresAtMonth = currentMonth;
        reports = reports.map((report) =>
          report.operationId === replaced.id && report.expiresAtMonth === undefined
            ? { ...report, expiresAtMonth: currentMonth + staleIntelligenceMonths }
            : report,
        );
      }

      const operation = buildOperation(spy, mission, currentMonth);
      operations.push(operation);
      retainedOperationIds.add(operation.id);
      events.push(buildSpyEvent({
        currentMonth,
        description: `${nation.name} dispatched a spy to ${nationName(world, operation.targetNationId)} for ${formatSpyMissionPolicy(operation.policy).toLowerCase()}.`,
        id: `event-spy-dispatched-${operation.id}`,
        kind: "spy_dispatched",
        nationIds: uniqueNationIds([operation.ownerNationId, operation.targetNationId, operation.secondaryTargetNationId]),
        title: "Spy Dispatched",
      }));
    });

    for (const operation of activeOperations) {
      if (retainedOperationIds.has(operation.id)) {
        continue;
      }
      operation.status = "expired";
      operation.expiresAtMonth = currentMonth;
      reports = reports.map((report) =>
        report.operationId === operation.id && report.expiresAtMonth === undefined
          ? { ...report, expiresAtMonth: currentMonth + staleIntelligenceMonths }
          : report,
      );
    }
  }

  return {
    events,
    spyNetwork: {
      ...spyNetwork,
      intelligenceReports: reports,
      operations,
    },
  };
}

function executeActiveSpyMissions(
  spyNetwork: SpyNetwork,
  initialRelations: NationRelations,
  world: World,
  currentMonth: number,
) {
  let relations = initialRelations;
  let reports = spyNetwork.intelligenceReports
    .filter((report) => report.expiresAtMonth === undefined || report.expiresAtMonth > currentMonth)
    .map((report) => ({ ...report }));
  const events: GameEvent[] = [];

  for (const operation of spyNetwork.operations) {
    if (operation.status !== "active") {
      continue;
    }

    if (operation.policy === "gather_intelligence") {
      if (!reports.some((report) => report.operationId === operation.id) && succeeds(world.seed, operation.id, currentMonth, 0.86)) {
        const income = calculateNationMonthlyIncome(world, operation.targetNationId);
        const economy = calculateNationCityEconomy(operation.targetNationId, world);
        reports.push({
          acquiredAtMonth: currentMonth,
          army: economy.army,
          id: `intel-${operation.id}-${currentMonth}`,
          monthlyGold: income.gold,
          monthlyResources: income.resources,
          operationId: operation.id,
          ownerNationId: operation.ownerNationId,
          targetNationId: operation.targetNationId,
        });
        events.push(buildSpyEvent({
          currentMonth,
          description: `${nationName(world, operation.ownerNationId)} obtained military and resource intelligence on ${nationName(world, operation.targetNationId)}.`,
          id: `event-intel-acquired-${operation.id}-${currentMonth}`,
          kind: "intelligence_acquired",
          nationIds: [operation.ownerNationId, operation.targetNationId],
          title: "Intelligence Acquired",
        }));
      }
      continue;
    }

    if ((currentMonth - operation.activatesAtMonth) % relationEffectIntervalMonths !== 0 || !succeeds(world.seed, operation.id, currentMonth, 0.74)) {
      continue;
    }

    if (operation.policy === "sow_discord" && operation.secondaryTargetNationId) {
      relations = adjustNationRelation(relations, operation.targetNationId, operation.secondaryTargetNationId, -5, currentMonth);
      events.push(buildSpyEvent({
        currentMonth,
        description: `${nationName(world, operation.ownerNationId)} sowed discord between ${nationName(world, operation.targetNationId)} and ${nationName(world, operation.secondaryTargetNationId)}.`,
        id: `event-spy-discord-${operation.id}-${currentMonth}`,
        kind: "relations_sowed_discord",
        nationIds: uniqueNationIds([operation.ownerNationId, operation.targetNationId, operation.secondaryTargetNationId]),
        title: "Relations Sowed Discord",
      }));
      continue;
    }

    const change = operation.policy === "improve_relations" ? 4 : -4;
    relations = adjustNationRelation(relations, operation.ownerNationId, operation.targetNationId, change, currentMonth);
    events.push(buildSpyEvent({
      currentMonth,
      description: `${nationName(world, operation.ownerNationId)} ${change > 0 ? "improved" : "damaged"} relations with ${nationName(world, operation.targetNationId)} through covert action.`,
      id: `event-spy-relations-${operation.id}-${currentMonth}`,
      kind: change > 0 ? "relations_improved" : "relations_damaged",
      nationIds: [operation.ownerNationId, operation.targetNationId],
      title: change > 0 ? "Relations Improved" : "Relations Damaged",
    }));
  }

  return {
    events,
    relations,
    spyNetwork: {
      ...spyNetwork,
      intelligenceReports: reports,
    },
  };
}

function refreshOperationStatuses(spyNetwork: SpyNetwork, currentMonth: number): SpyNetwork {
  return {
    ...spyNetwork,
    intelligenceReports: spyNetwork.intelligenceReports.filter(
      (report) => report.expiresAtMonth === undefined || report.expiresAtMonth > currentMonth,
    ),
    operations: spyNetwork.operations.map((operation) => {
      if (operation.status === "expired") {
        return operation;
      }
      if (operation.status === "deploying" && operation.activatesAtMonth <= currentMonth) {
        return { ...operation, status: "active" };
      }
      return operation;
    }),
  };
}

function buildOperation(spy: Spy, mission: SpyMissionIntent, currentMonth: number): SpyOperation {
  const activatesAtMonth = mission.policy === "gather_intelligence"
    ? currentMonth + intelligenceLeadMonths
    : currentMonth;
  return {
    activatesAtMonth,
    expiresAtMonth: currentMonth + missionReviewMonths,
    id: `spy-operation-${spy.id}-${currentMonth}`,
    ownerNationId: spy.nationId,
    policy: mission.policy,
    secondaryTargetNationId: mission.secondaryTargetNationId,
    spyId: spy.id,
    startedAtMonth: currentMonth,
    status: activatesAtMonth > currentMonth ? "deploying" : "active",
    targetNationId: mission.targetNationId ?? "",
  };
}

function sameMission(operation: SpyOperation, mission: SpyMissionIntent) {
  return operation.policy === mission.policy &&
    operation.targetNationId === mission.targetNationId &&
    operation.secondaryTargetNationId === mission.secondaryTargetNationId;
}

function isPolicyReviewMonth(policies: NationPolicies, currentMonth: number) {
  return Object.values(policies).some((policy) => policy.decidedAtMonth === currentMonth);
}

function succeeds(seed: string, operationId: string, currentMonth: number, chance: number) {
  let hash = 2166136261;
  const value = `${seed}:${operationId}:${currentMonth}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295 < chance;
}

function buildSpyEvent({ currentMonth, ...event }: Omit<GameEvent, "month"> & { currentMonth: number }): GameEvent {
  return {
    ...event,
    month: currentMonth,
  };
}

function nationName(world: World, nationId: string) {
  return world.nationById.get(nationId)?.name ?? nationId;
}

function uniqueNationIds(nationIds: Array<string | undefined>) {
  return [...new Set(nationIds.filter((nationId): nationId is string => Boolean(nationId)))];
}
