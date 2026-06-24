export type GameEventKind =
  | "alliance_signed"
  | "proposal_accepted"
  | "proposal_created"
  | "proposal_expired"
  | "proposal_rejected"
  | "truce_signed"
  | "war_declared"
  | "vassalage_signed";

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
