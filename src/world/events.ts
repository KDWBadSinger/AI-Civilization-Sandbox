export type GameEventKind =
  | "alliance_signed"
  | "alliance_dissolved"
  | "proposal_accepted"
  | "proposal_created"
  | "proposal_expired"
  | "proposal_rejected"
  | "truce_signed"
  | "war_declared"
  | "vassalage_signed"
  | "vassalage_broken"
  | "battle_fought"
  | "city_lost"
  | "city_developed"
  | "military_upkeep_shortage"
  | "military_supply_shortage"
  | "nation_defeated"
  | "province_occupied"
  | "army_group_created"
  | "army_group_merged"
  | "army_group_moved"
  | "army_group_ordered"
  | "recruitment_completed"
  | "war_ended"
  | "spy_dispatched"
  | "intelligence_acquired"
  | "relations_improved"
  | "relations_damaged"
  | "relations_sowed_discord";

export type GameEvent = {
  id: string;
  month: number;
  kind: GameEventKind;
  title: string;
  description: string;
  nationIds: string[];
};

export function sortEventsNewestFirst(events: GameEvent[]) {
  return [...events].sort((a, b) => b.month - a.month || b.id.localeCompare(a.id));
}

export function filterEventsForNation(events: GameEvent[], nationId: string, sinceMonth?: number) {
  return sortEventsNewestFirst(events).filter((event) =>
    event.nationIds.includes(nationId) && (sinceMonth === undefined || event.month >= sinceMonth),
  );
}
