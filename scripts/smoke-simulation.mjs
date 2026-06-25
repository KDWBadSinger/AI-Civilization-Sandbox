#!/usr/bin/env node

import { createServer } from "vite";

const defaultMonths = 600;
const importantEventKinds = [
  "war_declared",
  "battle_fought",
  "province_occupied",
  "city_lost",
  "war_ended",
  "army_group_created",
  "army_group_moved",
  "army_group_ordered",
  "recruitment_completed",
  "military_disbanded",
  "military_upkeep_shortage",
  "military_supply_shortage",
];

const args = parseArgs(process.argv.slice(2));
const monthsToRun = positiveInteger(args.months, defaultMonths);
const seed = typeof args.seed === "string" ? args.seed : undefined;

const server = await createServer({
  appType: "custom",
  configFile: "vite.config.ts",
  logLevel: "error",
  server: {
    middlewareMode: true,
  },
});

try {
  const [
    { buildDemoWorld },
    {
      buildInitialDiplomacyState,
      executeDiplomacyPoliciesWithEvents,
      evaluateDiplomaticProposalsWithEvents,
    },
    { buildInitialNationPolicies, advanceNationPolicies },
    { buildInitialNationRelations },
    { buildInitialNationStockpiles, settleNationStockpiles },
    { buildInitialSpyNetworkWithEvents, advanceSpyNetwork },
    {
      advanceArmyGroups,
      advanceMilitaryEconomy,
      advanceWarSystem,
      buildInitialMilitaryState,
      getNationWarSummary,
    },
    { calculateNationCityEconomy },
  ] = await Promise.all([
    server.ssrLoadModule("/src/world/buildDemoWorld.ts"),
    server.ssrLoadModule("/src/world/diplomacy.ts"),
    server.ssrLoadModule("/src/world/policyAI.ts"),
    server.ssrLoadModule("/src/world/relationships.ts"),
    server.ssrLoadModule("/src/world/settlement.ts"),
    server.ssrLoadModule("/src/world/spies.ts"),
    server.ssrLoadModule("/src/world/war.ts"),
    server.ssrLoadModule("/src/world/cityEconomy.ts"),
  ]);

  const world = buildDemoWorld(seed);
  const nationRelations = buildInitialNationRelations(world);
  const nationStockpiles = buildInitialNationStockpiles(world);
  const nationPolicies = buildInitialNationPolicies(world, nationRelations, nationStockpiles, 0);
  const initialSpies = buildInitialSpyNetworkWithEvents(world, nationPolicies);
  const allEvents = [...initialSpies.events];

  let simulation = {
    diplomacy: buildInitialDiplomacyState(world),
    elapsedMonths: 0,
    military: buildInitialMilitaryState(world),
    nationPolicies,
    nationRelations,
    nationStockpiles,
    spies: initialSpies.spyNetwork,
  };

  for (let month = 1; month <= monthsToRun; month += 1) {
    const stockpiles = settleNationStockpiles(world, simulation.nationStockpiles, 1);
    const policies = advanceNationPolicies(
      world,
      simulation.nationRelations,
      stockpiles,
      simulation.nationPolicies,
      simulation.elapsedMonths,
      month,
    );
    const militaryEconomy = advanceMilitaryEconomy(
      world,
      simulation.military,
      stockpiles,
      policies,
      simulation.diplomacy,
      month,
      1,
    );
    const spyUpdate = advanceSpyNetwork(
      simulation.spies,
      policies,
      simulation.nationRelations,
      world,
      month,
    );
    const execution = executeDiplomacyPoliciesWithEvents(
      simulation.diplomacy,
      policies,
      world,
      month,
    );
    const evaluation = evaluateDiplomaticProposalsWithEvents(
      execution.diplomacy,
      world,
      spyUpdate.relations,
      month,
    );
    const movementUpdate = advanceArmyGroups(
      world,
      evaluation.diplomacy,
      militaryEconomy.military,
      month,
    );
    const warUpdate = advanceWarSystem(
      world,
      evaluation.diplomacy,
      movementUpdate.military,
      spyUpdate.relations,
      spyUpdate.spyNetwork,
      month,
    );

    allEvents.push(
      ...militaryEconomy.events,
      ...spyUpdate.events,
      ...execution.events,
      ...evaluation.events,
      ...movementUpdate.events,
      ...warUpdate.events,
    );

    simulation = {
      diplomacy: warUpdate.diplomacy,
      elapsedMonths: month,
      military: warUpdate.military,
      nationPolicies: policies,
      nationRelations: warUpdate.relations,
      nationStockpiles: militaryEconomy.stockpiles,
      spies: spyUpdate.spyNetwork,
    };
  }

  const report = buildReport({
    allEvents,
    calculateNationCityEconomy,
    getNationWarSummary,
    monthsToRun,
    simulation,
    world,
  });

  printReport(report);
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await server.close();
}

function buildReport({
  allEvents,
  calculateNationCityEconomy,
  getNationWarSummary,
  monthsToRun,
  simulation,
  world,
}) {
  const eventCounts = countEvents(allEvents);
  const failures = [];
  const warnings = [];
  const lastActivityMonth = lastMonthOf(allEvents, [
    "army_group_created",
    "army_group_moved",
    "army_group_ordered",
    "battle_fought",
    "military_disbanded",
    "province_occupied",
    "recruitment_completed",
    "war_declared",
  ]);
  const warPairs = collectWarPairs(allEvents);
  const positiveWarRelations = [...warPairs]
    .map((key) => {
      const relation = simulation.nationRelations[key];
      return relation ? { key, relation } : undefined;
    })
    .filter((entry) => entry && entry.relation.attitude > 0);
  const stuckWars = simulation.diplomacy.wars.filter((war) =>
    monthsToRun - (war.lastBattleMonth ?? war.startedAtMonth) > 180,
  );
  const resourceOverflow = world.nations
    .map((nation) => {
      const stockpile = simulation.nationStockpiles[nation.id];
      const maxResource = Math.max(0, ...Object.values(stockpile?.resources ?? {}));
      return {
        gold: Math.round(stockpile?.gold ?? 0),
        maxResource: Math.round(maxResource),
        nation,
      };
    })
    .filter(({ gold, maxResource }) => gold > 100_000 || maxResource > 120_000);
  const armyOverflow = world.nations
    .map((nation) => {
      const summary = getNationWarSummary(
        simulation.diplomacy,
        simulation.military,
        world,
        nation.id,
      );
      const economy = calculateNationCityEconomy(nation.id, world);
      const softCap = Math.max(500, Math.round((economy.army / 28) * 2.6));
      return {
        nation,
        softCap,
        soldiers: summary.totalSoldiers,
      };
    })
    .filter(({ soldiers, softCap }) => soldiers > softCap);
  const northernNations = getNorthernNations(world, 3);
  const northernMilitaryEvents = countEventsForNations(allEvents, northernNations.map((nation) => nation.id), [
    "war_declared",
    "battle_fought",
    "province_occupied",
    "city_lost",
    "army_group_created",
    "army_group_moved",
  ]);

  if ((eventCounts.war_declared ?? 0) <= 0) {
    failures.push("No wars were declared during the simulation.");
  }
  if ((eventCounts.battle_fought ?? 0) <= 0) {
    failures.push("No battles were fought during the simulation.");
  }
  if ((eventCounts.army_group_moved ?? 0) <= 0) {
    failures.push("No army group movement was recorded.");
  }
  if (lastActivityMonth < monthsToRun - 120) {
    failures.push(`No major military or recruitment activity after month ${lastActivityMonth}.`);
  }
  if (positiveWarRelations.length > 0) {
    failures.push(
      `War pair relations ended positive: ${positiveWarRelations
        .map(({ relation }) => `${nationName(world, relation.nationAId)} / ${nationName(world, relation.nationBId)} = ${relation.attitude}`)
        .join("; ")}`,
    );
  }
  if (stuckWars.length > 0) {
    failures.push(
      `Wars stuck for over 180 months without battle: ${stuckWars
        .map((war) => `${nationName(world, war.attackerNationId)} vs ${nationName(world, war.defenderNationId)}`)
        .join("; ")}`,
    );
  }
  if (resourceOverflow.length > 0) {
    failures.push(
      `Resource overflow: ${resourceOverflow
        .map(({ gold, maxResource, nation }) => `${nation.name} gold=${gold}, maxResource=${maxResource}`)
        .join("; ")}`,
    );
  }
  if (armyOverflow.length > 0) {
    failures.push(
      `Army overflow: ${armyOverflow
        .map(({ nation, soldiers, softCap }) => `${nation.name} soldiers=${soldiers}, softCap=${softCap}`)
        .join("; ")}`,
    );
  }

  if ((eventCounts.military_disbanded ?? 0) <= 0) {
    warnings.push("No military disband events occurred. This can be OK, but the disband path was not exercised.");
  }
  if (northernMilitaryEvents <= 0) {
    warnings.push(
      `Northern nations had no military activity: ${northernNations.map((nation) => nation.name).join(", ")}.`,
    );
  }

  return {
    eventCounts,
    failures,
    finalWars: simulation.diplomacy.wars.length,
    lastActivityMonth,
    monthsToRun,
    nationSummaries: world.nations.map((nation) => {
      const summary = getNationWarSummary(
        simulation.diplomacy,
        simulation.military,
        world,
        nation.id,
      );
      const stockpile = simulation.nationStockpiles[nation.id];

      return {
        activeWars: summary.activeWars.length,
        gold: Math.round(stockpile?.gold ?? 0),
        name: nation.name,
        soldiers: summary.totalSoldiers,
      };
    }),
    northernNations: northernNations.map((nation) => nation.name),
    northernMilitaryEvents,
    warnings,
  };
}

function printReport(report) {
  console.log(`Simulation smoke test: ${report.monthsToRun} months`);
  console.log("");
  console.log("Important events:");
  for (const kind of importantEventKinds) {
    console.log(`- ${kind}: ${report.eventCounts[kind] ?? 0}`);
  }
  console.log("");
  console.log(`Last major activity month: ${report.lastActivityMonth}`);
  console.log(`Active wars at end: ${report.finalWars}`);
  console.log(`Northern nations: ${report.northernNations.join(", ")}`);
  console.log(`Northern military events: ${report.northernMilitaryEvents}`);
  console.log("");
  console.log("Final nations:");
  for (const nation of report.nationSummaries) {
    console.log(`- ${nation.name}: soldiers=${nation.soldiers}, gold=${nation.gold}, activeWars=${nation.activeWars}`);
  }

  if (report.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("");
  if (report.failures.length > 0) {
    console.log("FAILED:");
    for (const failure of report.failures) {
      console.log(`- ${failure}`);
    }
    return;
  }

  console.log("PASS");
}

function countEvents(events) {
  return events.reduce((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function lastMonthOf(events, kinds) {
  const kindSet = new Set(kinds);
  return events.reduce((lastMonth, event) =>
    kindSet.has(event.kind) ? Math.max(lastMonth, event.month) : lastMonth, 0);
}

function collectWarPairs(events) {
  return new Set(
    events
      .filter((event) => event.kind === "war_declared" && event.nationIds.length >= 2)
      .map((event) => pairKey(event.nationIds[0], event.nationIds[1])),
  );
}

function countEventsForNations(events, nationIds, kinds) {
  const nationSet = new Set(nationIds);
  const kindSet = new Set(kinds);
  return events.filter((event) =>
    kindSet.has(event.kind) && event.nationIds.some((nationId) => nationSet.has(nationId)),
  ).length;
}

function getNorthernNations(world, count) {
  return [...world.nations]
    .map((nation) => {
      const capital = nation.capitalCityId ? world.cityById.get(nation.capitalCityId) : undefined;
      const province = world.provinceById.get(nation.capitalProvinceId);
      return {
        nation,
        y: capital?.y ?? province?.centerY ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.y - b.y)
    .slice(0, count)
    .map(({ nation }) => nation);
}

function nationName(world, nationId) {
  return world.nationById.get(nationId)?.name ?? nationId;
}

function pairKey(nationAId, nationBId) {
  return [nationAId, nationBId].sort().join("__");
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=");
    parsed[rawKey] = inlineValue ?? rawArgs[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
  }
  return parsed;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
