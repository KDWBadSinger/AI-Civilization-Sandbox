import { buildInitialDiplomacyState, evaluateDiplomaticProposalsWithEvents, executeDiplomacyPoliciesWithEvents } from "./diplomacy";
import type { GameEvent } from "./events";
import { isNationActive } from "./nationStatus";
import { advanceNationPolicies, buildInitialNationPolicies, type NationPolicyState } from "./policyAI";
import { buildInitialNationRelations, type NationRelations } from "./relationships";
import { buildInitialNationStockpiles, settleNationStockpiles, type NationStockpile } from "./settlement";
import { advanceSpyNetwork, buildInitialSpyNetworkWithEvents, type SpyNetwork } from "./spies";
import type { World } from "./types";
import { advanceArmyGroups, advanceMilitaryEconomy, advanceWarSystem, buildInitialMilitaryState, type MilitaryState } from "./war";

/** 回合制模拟的完整可持久化状态。 */
export type SimulationState = {
  defeatedNations: Record<string, DefeatedNationRecord>;
  diplomacy: ReturnType<typeof buildInitialDiplomacyState>;
  elapsedMonths: number;
  events: GameEvent[];
  mapRevision: number;
  military: MilitaryState;
  nationPolicies: Record<string, NationPolicyState>;
  nationRelations: NationRelations;
  nationStockpiles: Record<string, NationStockpile>;
  spies: SpyNetwork;
};

/** 已亡国家的结算记录，用于详情页展示亡国时间和胜利者。 */
export type DefeatedNationRecord = {
  defeatedAtMonth: number;
  defeatedNationId: string;
  victorNationId: string;
};

/** 单个国家行动时提供给 AI/API 适配器的只读上下文。 */
export type NationTurnContext = {
  nationId: string;
  turnNumber: number;
  world: World;
  simulation: Readonly<SimulationState>;
};

/** 回合执行进度，用于界面显示当前等待的国家及已完成数量。 */
export type TurnProgress = {
  turnNumber: number;
  activeNationId?: string;
  completedNationIds: string[];
  totalNations: number;
  phase: "idle" | "acting" | "resolving";
};

/**
 * 国家行动执行器。接入真实 AI API 时应返回在响应完成后才兑现的 Promise；拒绝会阻止本回合结算。
 */
export type NationTurnExecutor = (context: NationTurnContext) => Promise<void>;

/** 创建一局回合制模拟的初始状态。 */
export function createInitialSimulationState(world: World): SimulationState {
  const nationRelations = buildInitialNationRelations(world);
  const nationStockpiles = buildInitialNationStockpiles(world);
  const nationPolicies = buildInitialNationPolicies(world, nationRelations, nationStockpiles, 0);
  const initialSpies = buildInitialSpyNetworkWithEvents(world, nationPolicies);
  return {
    defeatedNations: {}, diplomacy: buildInitialDiplomacyState(world), elapsedMonths: 0, events: initialSpies.events,
    mapRevision: 0, military: buildInitialMilitaryState(world), nationPolicies, nationRelations,
    nationStockpiles, spies: initialSpies.spyNetwork,
  };
}

/**
 * 顺序等待全部存续国家完成行动，再统一结算一个固定长度的回合。
 *
 * @param world 当前世界对象，会由战争系统更新领土归属
 * @param current 当前回合开始前的模拟状态
 * @param executeNationAction 单国行动执行器，可在此调用 AI API；默认立即完成
 * @param onProgress 可选进度回调，仅用于展示，不改变模拟结果
 * @returns 全部国家完成行动并结算后的新状态
 * @throws 单国执行器失败时原样抛出，本回合不会推进
 */
export async function advanceSimulationTurn(
  world: World,
  current: SimulationState,
  executeNationAction: NationTurnExecutor = async () => undefined,
  onProgress?: (progress: TurnProgress) => void,
): Promise<SimulationState> {
  const turnNumber = current.elapsedMonths + 1;
  const activeNations = world.nations.filter((nation) => isNationActive(world, nation.id));
  const completedNationIds: string[] = [];

  for (const nation of activeNations) {
    onProgress?.({ turnNumber, activeNationId: nation.id, completedNationIds: [...completedNationIds], totalNations: activeNations.length, phase: "acting" });
    await executeNationAction({ nationId: nation.id, turnNumber, world, simulation: current });
    completedNationIds.push(nation.id);
  }

  onProgress?.({ turnNumber, completedNationIds: [...completedNationIds], totalNations: activeNations.length, phase: "resolving" });
  return resolveTurn(world, current, turnNumber);
}

function resolveTurn(world: World, current: SimulationState, nextMonth: number): SimulationState {
  const currentMonth = current.elapsedMonths;
  const nationStockpiles = settleNationStockpiles(world, current.nationStockpiles, 1);
  const nationPolicies = advanceNationPolicies(world, current.nationRelations, nationStockpiles, current.nationPolicies, currentMonth, nextMonth);
  const militaryEconomy = advanceMilitaryEconomy(world, current.military, nationStockpiles, nationPolicies, current.diplomacy, nextMonth, 1);
  const spyUpdate = advanceSpyNetwork(current.spies, nationPolicies, current.nationRelations, world, nextMonth);
  const execution = executeDiplomacyPoliciesWithEvents(current.diplomacy, nationPolicies, world, nextMonth);
  const evaluation = evaluateDiplomaticProposalsWithEvents(execution.diplomacy, world, spyUpdate.relations, nextMonth);
  const movementUpdate = advanceArmyGroups(world, evaluation.diplomacy, militaryEconomy.military, nextMonth);
  const warUpdate = advanceWarSystem(world, evaluation.diplomacy, movementUpdate.military, spyUpdate.relations, spyUpdate.spyNetwork, nextMonth);
  const newEvents = [...militaryEconomy.events, ...spyUpdate.events, ...execution.events, ...evaluation.events, ...movementUpdate.events, ...warUpdate.events];
  const defeatedNations = collectDefeatedNationRecords(current.defeatedNations, newEvents);
  return {
    defeatedNations, diplomacy: warUpdate.diplomacy, elapsedMonths: nextMonth,
    events: [...current.events, ...newEvents].slice(-240),
    mapRevision: current.mapRevision + (warUpdate.mapChanged || movementUpdate.mapChanged ? 1 : 0),
    military: warUpdate.military, nationPolicies, nationRelations: warUpdate.relations,
    nationStockpiles: militaryEconomy.stockpiles, spies: spyUpdate.spyNetwork,
  };
}

function collectDefeatedNationRecords(
  currentRecords: Record<string, DefeatedNationRecord>,
  events: GameEvent[],
) {
  let records = currentRecords;
  for (const event of events) {
    if (event.kind !== "nation_defeated" || event.nationIds.length < 2) {
      continue;
    }
    const [victorNationId, defeatedNationId] = event.nationIds;
    if (records[defeatedNationId]) {
      continue;
    }
    records = {
      ...records,
      [defeatedNationId]: { defeatedAtMonth: event.month, defeatedNationId, victorNationId },
    };
  }
  return records;
}
