import { calculateNationCityEconomy } from "./cityEconomy";
import type { GameEvent } from "./events";
import { isNationActive } from "./nationStatus";
import type { NationPolicies } from "./policyAI";
import { getNationRelation, relationKey, type NationRelations } from "./relationships";
import type { Resource, World } from "./types";

export type WarState = {
  id: string;
  attackerNationId: string;
  defenderNationId: string;
  startedAtMonth: number;
  lastBattleMonth?: number;
  battleCount?: number;
  attackerScore?: number;
  defenderScore?: number;
  relationPenaltyAppliedMonth?: number;
  targetProvinceId?: string;
};

export type AllianceTreaty = {
  id: string;
  nationAId: string;
  nationBId: string;
  signedAtMonth: number;
  mutualDefense: boolean;
};

export type VassalContract = {
  id: string;
  overlordNationId: string;
  vassalNationId: string;
  signedAtMonth: number;
  goldTributeRate: number;
  resourceTributeRate: number;
};

export type TruceAgreement = {
  id: string;
  nationAId: string;
  nationBId: string;
  signedAtMonth: number;
  expiresAtMonth: number;
};

export type ProposalType = "alliance" | "peace" | "vassalage_offer" | "vassalage_demand";

export type PeaceTerms = "status_quo" | "reparations" | "cede_province";

export type DiplomaticProposal = {
  id: string;
  type: ProposalType;
  fromNationId: string;
  toNationId: string;
  createdAtMonth: number;
  expiresAtMonth: number;
  offeredGold?: number;
  offeredResources?: Partial<Record<Resource, number>>;
  requestedProvinceIds?: string[];
  peaceTerms?: PeaceTerms;
};

export type DiplomacyState = {
  wars: WarState[];
  alliances: AllianceTreaty[];
  vassalContracts: VassalContract[];
  truces: TruceAgreement[];
  proposals: DiplomaticProposal[];
};

export type NationDiplomacySummary = {
  wars: WarState[];
  alliances: AllianceTreaty[];
  overlordContract?: VassalContract;
  vassalContracts: VassalContract[];
  truces: TruceAgreement[];
  proposals: DiplomaticProposal[];
};

export type DiplomacyUpdate = {
  diplomacy: DiplomacyState;
  events: GameEvent[];
};

export function buildInitialDiplomacyState(_world: World): DiplomacyState {
  return {
    alliances: [],
    proposals: [],
    truces: [],
    vassalContracts: [],
    wars: [],
  };
}

export function executeDiplomacyPolicies(
  diplomacy: DiplomacyState,
  policies: NationPolicies,
  currentMonth: number,
): DiplomacyState {
  return executeDiplomacyPoliciesWithEvents(diplomacy, policies, undefined, currentMonth).diplomacy;
}

export function executeDiplomacyPoliciesWithEvents(
  diplomacy: DiplomacyState,
  policies: NationPolicies,
  world: World | undefined,
  currentMonth: number,
): DiplomacyUpdate {
  let changed = false;
  const events: GameEvent[] = [];
  const next: DiplomacyState = {
    alliances: [...diplomacy.alliances],
    proposals: diplomacy.proposals.filter((proposal) => proposal.expiresAtMonth > currentMonth),
    truces: diplomacy.truces.filter((truce) => truce.expiresAtMonth > currentMonth),
    vassalContracts: [...diplomacy.vassalContracts],
    wars: [...diplomacy.wars],
  };

  if (next.proposals.length !== diplomacy.proposals.length || next.truces.length !== diplomacy.truces.length) {
    changed = true;
  }

  for (const [nationId, policyState] of Object.entries(policies)) {
    if (policyState.decidedAtMonth !== currentMonth) {
      continue;
    }

    const diplomacyPolicy = policyState.diplomacy;
    const targetNationId = diplomacyPolicy.targetNationId;

    if (!targetNationId || nationId === targetNationId) {
      continue;
    }
    if (world && (!isNationActive(world, nationId) || !isNationActive(world, targetNationId))) {
      continue;
    }

    switch (diplomacyPolicy.policy) {
      case "declare_war":
        if (canDeclareWar(next, nationId, targetNationId, currentMonth, world)) {
          next.wars.push({
            attackerNationId: nationId,
            defenderNationId: targetNationId,
            id: `war-${relationKey(nationId, targetNationId)}-${currentMonth}`,
            startedAtMonth: currentMonth,
          });
          events.push(buildDiplomacyEvent({
            currentMonth,
            description: `${nationName(world, nationId)} declared war on ${nationName(world, targetNationId)}.`,
            id: `event-war-${relationKey(nationId, targetNationId)}-${currentMonth}`,
            kind: "war_declared",
            nationIds: [nationId, targetNationId],
            title: "War Declared",
          }));
          changed = true;
        }
        break;
      case "seek_alliance":
        if (canProposeAlliance(next, nationId, targetNationId)) {
          const proposal = buildProposal("alliance", nationId, targetNationId, currentMonth);
          next.proposals.push(proposal);
          events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_created"));
          changed = true;
        }
        break;
      case "seek_peace":
        if (areNationsAtWar(next, nationId, targetNationId) && !hasProposal(next, "peace", nationId, targetNationId)) {
          const proposal = {
            ...buildProposal("peace", nationId, targetNationId, currentMonth),
            peaceTerms: "status_quo",
          } satisfies DiplomaticProposal;
          next.proposals.push(proposal);
          events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_created"));
          changed = true;
        }
        break;
      case "seek_vassalage":
        if (canProposeVassalage(next, nationId, targetNationId)) {
          const proposal = buildProposal("vassalage_offer", nationId, targetNationId, currentMonth);
          next.proposals.push(proposal);
          events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_created"));
          changed = true;
        }
        break;
      case "demand_vassalage":
        if (canProposeVassalage(next, targetNationId, nationId)) {
          const proposal = buildProposal("vassalage_demand", nationId, targetNationId, currentMonth);
          next.proposals.push(proposal);
          events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_created"));
          changed = true;
        }
        break;
      case "none":
      case "surrender":
        break;
    }
  }

  return {
    diplomacy: changed ? next : diplomacy,
    events,
  };
}

export function evaluateDiplomaticProposals(
  diplomacy: DiplomacyState,
  world: World,
  relations: NationRelations,
  currentMonth: number,
): DiplomacyState {
  return evaluateDiplomaticProposalsWithEvents(diplomacy, world, relations, currentMonth).diplomacy;
}

export function evaluateDiplomaticProposalsWithEvents(
  diplomacy: DiplomacyState,
  world: World,
  relations: NationRelations,
  currentMonth: number,
): DiplomacyUpdate {
  let changed = false;
  const events: GameEvent[] = [];
  const next: DiplomacyState = {
    alliances: [...diplomacy.alliances],
    proposals: [],
    truces: diplomacy.truces.filter((truce) => truce.expiresAtMonth > currentMonth),
    vassalContracts: [...diplomacy.vassalContracts],
    wars: [...diplomacy.wars],
  };

  if (next.truces.length !== diplomacy.truces.length) {
    changed = true;
  }

  const treatyMaintenanceEvents = maintainLongTermTreaties(next, world, relations, currentMonth);
  if (treatyMaintenanceEvents.length > 0) {
    events.push(...treatyMaintenanceEvents);
    changed = true;
  }

  for (const proposal of diplomacy.proposals) {
    if (!isNationActive(world, proposal.fromNationId) || !isNationActive(world, proposal.toNationId)) {
      changed = true;
      continue;
    }

    if (proposal.expiresAtMonth <= currentMonth) {
      events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_expired"));
      changed = true;
      continue;
    }

    if (currentMonth <= proposal.createdAtMonth) {
      next.proposals.push(proposal);
      continue;
    }

    if (shouldAcceptProposal(proposal, next, world, relations, currentMonth)) {
      const acceptedEvents = applyAcceptedProposal(proposal, next, world, currentMonth);
      events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_accepted"), ...acceptedEvents);
      changed = true;
      continue;
    }

    events.push(buildProposalEvent(proposal, world, currentMonth, "proposal_rejected"));
    changed = true;
  }

  return {
    diplomacy: changed ? next : diplomacy,
    events,
  };
}

export function getNationDiplomacySummary(
  diplomacy: DiplomacyState,
  nationId: string,
): NationDiplomacySummary {
  return {
    alliances: diplomacy.alliances.filter((alliance) =>
      treatyIncludesNation(alliance.nationAId, alliance.nationBId, nationId),
    ),
    overlordContract: diplomacy.vassalContracts.find((contract) => contract.vassalNationId === nationId),
    proposals: diplomacy.proposals.filter((proposal) =>
      proposal.fromNationId === nationId || proposal.toNationId === nationId,
    ),
    truces: diplomacy.truces.filter((truce) =>
      treatyIncludesNation(truce.nationAId, truce.nationBId, nationId),
    ),
    vassalContracts: diplomacy.vassalContracts.filter((contract) => contract.overlordNationId === nationId),
    wars: diplomacy.wars.filter((war) =>
      treatyIncludesNation(war.attackerNationId, war.defenderNationId, nationId),
    ),
  };
}

export function areNationsAtWar(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
) {
  return diplomacy.wars.some((war) =>
    relationKey(war.attackerNationId, war.defenderNationId) === relationKey(nationAId, nationBId),
  );
}

export function areNationsAllied(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
) {
  return diplomacy.alliances.some((alliance) =>
    relationKey(alliance.nationAId, alliance.nationBId) === relationKey(nationAId, nationBId),
  );
}

export function hasActiveTruce(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
  currentMonth: number,
) {
  return diplomacy.truces.some((truce) =>
    relationKey(truce.nationAId, truce.nationBId) === relationKey(nationAId, nationBId) &&
    truce.expiresAtMonth > currentMonth,
  );
}

export function getOtherTreatyNationId(
  nationAId: string,
  nationBId: string,
  perspectiveNationId: string,
) {
  return nationAId === perspectiveNationId ? nationBId : nationAId;
}

export function formatProposalType(type: ProposalType) {
  switch (type) {
    case "alliance":
      return "Alliance Request";
    case "peace":
      return "Peace Offer";
    case "vassalage_demand":
      return "Vassalage Demand";
    case "vassalage_offer":
      return "Vassalage Offer";
  }
}

function shouldAcceptProposal(
  proposal: DiplomaticProposal,
  diplomacy: DiplomacyState,
  world: World,
  relations: NationRelations,
  currentMonth: number,
) {
  const relation = getNationRelation(relations, proposal.fromNationId, proposal.toNationId);
  const attitude = relation?.attitude ?? 0;
  const proposerPower = calculateNationPower(world, proposal.fromNationId);
  const receiverPower = calculateNationPower(world, proposal.toNationId);

  switch (proposal.type) {
    case "alliance":
      return (
        attitude >= 45 &&
        !areNationsAtWar(diplomacy, proposal.fromNationId, proposal.toNationId) &&
        !areNationsAllied(diplomacy, proposal.fromNationId, proposal.toNationId) &&
        !hasVassalTie(diplomacy, proposal.fromNationId, proposal.toNationId)
      );
    case "peace": {
      const war = diplomacy.wars.find((existingWar) =>
        relationKey(existingWar.attackerNationId, existingWar.defenderNationId) ===
        relationKey(proposal.fromNationId, proposal.toNationId),
      );
      const warAge = war ? currentMonth - war.startedAtMonth : 0;
      const receiverIsWeaker = receiverPower < proposerPower * 0.86;

      return Boolean(war) && (attitude >= -35 || warAge >= 6 || receiverIsWeaker);
    }
    case "vassalage_offer":
      return (
        attitude >= -10 &&
        proposerPower < receiverPower * 0.9 &&
        !hasVassalTie(diplomacy, proposal.fromNationId, proposal.toNationId)
      );
    case "vassalage_demand":
      return (
        receiverPower < proposerPower * 0.62 ||
        (attitude >= 35 && receiverPower < proposerPower * 0.82)
      ) && !hasVassalTie(diplomacy, proposal.fromNationId, proposal.toNationId);
  }
}

function applyAcceptedProposal(
  proposal: DiplomaticProposal,
  diplomacy: DiplomacyState,
  world: World,
  currentMonth: number,
) {
  const events: GameEvent[] = [];

  switch (proposal.type) {
    case "alliance":
      if (!areNationsAllied(diplomacy, proposal.fromNationId, proposal.toNationId)) {
        diplomacy.alliances.push({
          id: `alliance-${relationKey(proposal.fromNationId, proposal.toNationId)}-${currentMonth}`,
          mutualDefense: true,
          nationAId: proposal.fromNationId,
          nationBId: proposal.toNationId,
          signedAtMonth: currentMonth,
        });
        events.push(buildDiplomacyEvent({
          currentMonth,
          description: `${nationName(world, proposal.fromNationId)} and ${nationName(world, proposal.toNationId)} signed a mutual defense alliance.`,
          id: `event-alliance-${relationKey(proposal.fromNationId, proposal.toNationId)}-${currentMonth}`,
          kind: "alliance_signed",
          nationIds: [proposal.fromNationId, proposal.toNationId],
          title: "Alliance Signed",
        }));
      }
      break;
    case "peace":
      diplomacy.wars = diplomacy.wars.filter((war) =>
        relationKey(war.attackerNationId, war.defenderNationId) !==
        relationKey(proposal.fromNationId, proposal.toNationId),
      );
      diplomacy.truces.push({
        expiresAtMonth: currentMonth + 24,
        id: `truce-${relationKey(proposal.fromNationId, proposal.toNationId)}-${currentMonth}`,
        nationAId: proposal.fromNationId,
        nationBId: proposal.toNationId,
        signedAtMonth: currentMonth,
      });
      events.push(buildDiplomacyEvent({
        currentMonth,
        description: `${nationName(world, proposal.fromNationId)} and ${nationName(world, proposal.toNationId)} agreed to a 24-month truce.`,
        id: `event-truce-${relationKey(proposal.fromNationId, proposal.toNationId)}-${currentMonth}`,
        kind: "truce_signed",
        nationIds: [proposal.fromNationId, proposal.toNationId],
        title: "Truce Signed",
      }));
      break;
    case "vassalage_offer":
      diplomacy.vassalContracts.push({
        goldTributeRate: 0.12,
        id: `vassal-${proposal.toNationId}-${proposal.fromNationId}-${currentMonth}`,
        overlordNationId: proposal.toNationId,
        resourceTributeRate: 0.08,
        signedAtMonth: currentMonth,
        vassalNationId: proposal.fromNationId,
      });
      events.push(buildDiplomacyEvent({
        currentMonth,
        description: `${nationName(world, proposal.fromNationId)} became a vassal of ${nationName(world, proposal.toNationId)}.`,
        id: `event-vassal-${proposal.toNationId}-${proposal.fromNationId}-${currentMonth}`,
        kind: "vassalage_signed",
        nationIds: [proposal.fromNationId, proposal.toNationId],
        title: "Vassalage Accepted",
      }));
      break;
    case "vassalage_demand":
      diplomacy.vassalContracts.push({
        goldTributeRate: 0.16,
        id: `vassal-${proposal.fromNationId}-${proposal.toNationId}-${currentMonth}`,
        overlordNationId: proposal.fromNationId,
        resourceTributeRate: 0.1,
        signedAtMonth: currentMonth,
        vassalNationId: proposal.toNationId,
      });
      events.push(buildDiplomacyEvent({
        currentMonth,
        description: `${nationName(world, proposal.toNationId)} submitted to ${nationName(world, proposal.fromNationId)} as a vassal.`,
        id: `event-vassal-${proposal.fromNationId}-${proposal.toNationId}-${currentMonth}`,
        kind: "vassalage_signed",
        nationIds: [proposal.fromNationId, proposal.toNationId],
        title: "Vassalage Accepted",
      }));
      break;
  }

  return events;
}

function maintainLongTermTreaties(
  diplomacy: DiplomacyState,
  world: World,
  relations: NationRelations,
  currentMonth: number,
) {
  const events: GameEvent[] = [];

  diplomacy.alliances = diplomacy.alliances.filter((alliance) => {
    if (!isNationActive(world, alliance.nationAId) || !isNationActive(world, alliance.nationBId)) {
      return false;
    }

    const age = currentMonth - alliance.signedAtMonth;
    const relation = getNationRelation(relations, alliance.nationAId, alliance.nationBId);
    if (age < 144 || (relation?.attitude ?? 0) >= 20) {
      return true;
    }

    events.push(buildDiplomacyEvent({
      currentMonth,
      description: `${nationName(world, alliance.nationAId)} and ${nationName(world, alliance.nationBId)} dissolved their alliance after relations cooled.`,
      id: `event-alliance-dissolved-${alliance.id}-${currentMonth}`,
      kind: "alliance_dissolved",
      nationIds: [alliance.nationAId, alliance.nationBId],
      title: "Alliance Dissolved",
    }));
    return false;
  });

  diplomacy.vassalContracts = diplomacy.vassalContracts.filter((contract) => {
    if (!isNationActive(world, contract.overlordNationId) || !isNationActive(world, contract.vassalNationId)) {
      return false;
    }

    const age = currentMonth - contract.signedAtMonth;
    if (age < 120) {
      return true;
    }

    const relation = getNationRelation(relations, contract.overlordNationId, contract.vassalNationId);
    const overlordPower = calculateNationPower(world, contract.overlordNationId);
    const vassalPower = calculateNationPower(world, contract.vassalNationId);
    const shouldBreak =
      (relation?.attitude ?? 0) <= -45 ||
      vassalPower >= overlordPower * 0.72;

    if (!shouldBreak) {
      return true;
    }

    events.push(buildDiplomacyEvent({
      currentMonth,
      description: `${nationName(world, contract.vassalNationId)} broke vassalage with ${nationName(world, contract.overlordNationId)}.`,
      id: `event-vassal-broken-${contract.id}-${currentMonth}`,
      kind: "vassalage_broken",
      nationIds: [contract.overlordNationId, contract.vassalNationId],
      title: "Vassalage Broken",
    }));

    if (!areNationsAtWar(diplomacy, contract.overlordNationId, contract.vassalNationId)) {
      diplomacy.wars.push({
        attackerNationId: contract.vassalNationId,
        defenderNationId: contract.overlordNationId,
        id: `war-rebellion-${relationKey(contract.overlordNationId, contract.vassalNationId)}-${currentMonth}`,
        startedAtMonth: currentMonth,
      });
      events.push(buildDiplomacyEvent({
        currentMonth,
        description: `${nationName(world, contract.vassalNationId)} rebelled against ${nationName(world, contract.overlordNationId)}.`,
        id: `event-vassal-rebellion-${contract.id}-${currentMonth}`,
        kind: "war_declared",
        nationIds: [contract.overlordNationId, contract.vassalNationId],
        title: "Vassal Rebellion",
      }));
    }

    return false;
  });

  return events;
}

function treatyIncludesNation(nationAId: string, nationBId: string, nationId: string) {
  return nationAId === nationId || nationBId === nationId;
}

function calculateNationPower(world: World, nationId: string) {
  const economy = calculateNationCityEconomy(nationId, world);
  const provinceCount = world.provinces.filter((province) => province.nationId === nationId).length;
  const cityCount = world.cities.filter((city) => city.nationId === nationId).length;

  return economy.army + economy.monthlyGold * 20 + economy.population / 20 + provinceCount * 80 + cityCount * 260;
}

function buildProposal(
  type: ProposalType,
  fromNationId: string,
  toNationId: string,
  currentMonth: number,
): DiplomaticProposal {
  return {
    createdAtMonth: currentMonth,
    expiresAtMonth: currentMonth + 6,
    fromNationId,
    id: `proposal-${type}-${relationKey(fromNationId, toNationId)}-${currentMonth}`,
    toNationId,
    type,
  };
}

function canDeclareWar(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
  currentMonth: number,
  world?: World,
) {
  return (
    !areNationsAtWar(diplomacy, nationAId, nationBId) &&
    !areNationsAllied(diplomacy, nationAId, nationBId) &&
    !hasVassalTie(diplomacy, nationAId, nationBId) &&
    !hasActiveTruce(diplomacy, nationAId, nationBId, currentMonth) &&
    (!world || areAdjacentNations(world, nationAId, nationBId))
  );
}

function areAdjacentNations(world: World, nationAId: string, nationBId: string) {
  const tileByCoord = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

  for (const tile of world.tiles) {
    const province = tile.provinceId ? world.provinceById.get(tile.provinceId) : undefined;
    if (province?.nationId !== nationAId) {
      continue;
    }

    const neighbors = [
      tileByCoord.get(`${tile.x + 1},${tile.y}`),
      tileByCoord.get(`${tile.x - 1},${tile.y}`),
      tileByCoord.get(`${tile.x},${tile.y + 1}`),
      tileByCoord.get(`${tile.x},${tile.y - 1}`),
    ];
    if (neighbors.some((neighbor) => {
      const neighborProvince = neighbor?.provinceId ? world.provinceById.get(neighbor.provinceId) : undefined;
      return neighborProvince?.nationId === nationBId;
    })) {
      return true;
    }
  }

  return false;
}

function canProposeAlliance(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
) {
  return (
    !areNationsAtWar(diplomacy, nationAId, nationBId) &&
    !areNationsAllied(diplomacy, nationAId, nationBId) &&
    !hasVassalTie(diplomacy, nationAId, nationBId) &&
    !hasProposal(diplomacy, "alliance", nationAId, nationBId)
  );
}

function canProposeVassalage(
  diplomacy: DiplomacyState,
  vassalNationId: string,
  overlordNationId: string,
) {
  return (
    !areNationsAtWar(diplomacy, vassalNationId, overlordNationId) &&
    !areNationsAllied(diplomacy, vassalNationId, overlordNationId) &&
    !hasVassalTie(diplomacy, vassalNationId, overlordNationId) &&
    !hasProposal(diplomacy, "vassalage_offer", vassalNationId, overlordNationId) &&
    !hasProposal(diplomacy, "vassalage_demand", overlordNationId, vassalNationId)
  );
}

function hasVassalTie(
  diplomacy: DiplomacyState,
  nationAId: string,
  nationBId: string,
) {
  return diplomacy.vassalContracts.some((contract) =>
    relationKey(contract.overlordNationId, contract.vassalNationId) === relationKey(nationAId, nationBId),
  );
}

function hasProposal(
  diplomacy: DiplomacyState,
  type: ProposalType,
  nationAId: string,
  nationBId: string,
) {
  return diplomacy.proposals.some((proposal) =>
    proposal.type === type &&
    relationKey(proposal.fromNationId, proposal.toNationId) === relationKey(nationAId, nationBId),
  );
}

function buildProposalEvent(
  proposal: DiplomaticProposal,
  world: World | undefined,
  currentMonth: number,
  kind: "proposal_accepted" | "proposal_created" | "proposal_expired" | "proposal_rejected",
): GameEvent {
  const proposalLabel = formatProposalType(proposal.type);
  const action = {
    proposal_accepted: "accepted",
    proposal_created: "created",
    proposal_expired: "expired",
    proposal_rejected: "rejected",
  }[kind];

  return buildDiplomacyEvent({
    currentMonth,
    description: `${proposalLabel} from ${nationName(world, proposal.fromNationId)} to ${nationName(world, proposal.toNationId)} was ${action}.`,
    id: `event-${kind}-${proposal.id}-${currentMonth}`,
    kind,
    nationIds: [proposal.fromNationId, proposal.toNationId],
    title: `${proposalLabel} ${capitalize(action)}`,
  });
}

function buildDiplomacyEvent({
  currentMonth,
  description,
  id,
  kind,
  nationIds,
  title,
}: {
  currentMonth: number;
  description: string;
  id: string;
  kind: GameEvent["kind"];
  nationIds: string[];
  title: string;
}): GameEvent {
  return {
    description,
    id,
    kind,
    month: currentMonth,
    nationIds,
    title,
  };
}

function nationName(world: World | undefined, nationId: string) {
  return world?.nationById.get(nationId)?.name ?? nationId;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
