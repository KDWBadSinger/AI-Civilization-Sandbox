import { useCallback, useEffect, useMemo, useState } from "react";
import { type MapMode, WorldMap } from "./components/WorldMap";
import { buildDemoWorld } from "./world/buildDemoWorld";
import { calculateCityEconomy, calculateNationCityEconomy } from "./world/cityEconomy";
import {
  buildInitialDiplomacyState,
  evaluateDiplomaticProposalsWithEvents,
  executeDiplomacyPoliciesWithEvents,
  formatProposalType,
  getNationDiplomacySummary,
  getOtherTreatyNationId,
  type NationDiplomacySummary,
} from "./world/diplomacy";
import { addYield, formatResourceName, getTileMonthlyYield, type ResourceTotals } from "./world/economy";
import {
  filterEventsForNation,
  sortEventsNewestFirst,
  type GameEvent,
} from "./world/events";
import {
  advanceNationPolicies,
  buildInitialNationPolicies,
  type NationPolicyState,
} from "./world/policyAI";
import {
  buildInitialNationRelations,
  getAttitudeLabel,
  getNationRelationsFor,
  otherNationId,
  type NationRelation,
  type NationRelations,
} from "./world/relationships";
import {
  buildInitialNationStockpiles,
  calculateNationMonthlyIncome,
  settleNationStockpiles,
  type NationStockpile,
} from "./world/settlement";
import {
  advanceSpyNetwork,
  buildInitialSpyNetworkWithEvents,
  formatSpyMissionPolicy,
  getNationSpySummary,
  type NationSpySummary,
  type SpyNetwork,
} from "./world/spies";
import type { City, Nation, Resource, Terrain, Tile } from "./world/types";

const world = buildDemoWorld();
const mapModes: { id: MapMode; label: string }[] = [
  { id: "political", label: "Political" },
  { id: "terrain", label: "Terrain" },
  { id: "resources", label: "Resources" },
];
const speedOptions = [1, 2, 5] as const;
type SimulationSpeed = (typeof speedOptions)[number];

type SimulationState = {
  diplomacy: Parameters<typeof getNationDiplomacySummary>[0];
  elapsedMonths: number;
  events: GameEvent[];
  nationPolicies: Record<string, NationPolicyState>;
  nationRelations: NationRelations;
  nationStockpiles: Record<string, NationStockpile>;
  spies: SpyNetwork;
};

function buildAppShellClassName(isPanelOpen: boolean, isEventPanelOpen: boolean) {
  return [
    "appShell",
    isPanelOpen ? "" : "panelCollapsed",
    isEventPanelOpen ? "eventPanelOpen" : "eventPanelCollapsed",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function App() {
  const [mapMode, setMapMode] = useState<MapMode>("political");
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [eventLogMode, setEventLogMode] = useState<"nation" | "overview">("overview");
  const [eventNationId, setEventNationId] = useState<string>(world.nations[0]?.id ?? "");
  const [isEventPanelOpen, setIsEventPanelOpen] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [simulation, setSimulation] = useState<SimulationState>(() => {
    const nationRelations = buildInitialNationRelations(world);
    const nationStockpiles = buildInitialNationStockpiles(world);
    const nationPolicies = buildInitialNationPolicies(world, nationRelations, nationStockpiles, 0);
    const initialSpies = buildInitialSpyNetworkWithEvents(world, nationPolicies);

    return {
      diplomacy: buildInitialDiplomacyState(world),
      elapsedMonths: 0,
      events: initialSpies.events,
      nationPolicies,
      nationRelations,
      nationStockpiles,
      spies: initialSpies.spyNetwork,
    };
  });
  const [selectedCityId, setSelectedCityId] = useState<string | undefined>();
  const [cityReturnNationId, setCityReturnNationId] = useState<string | undefined>();
  const [selectedNationId, setSelectedNationId] = useState<string | undefined>();
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | undefined>(
    world.provinces[0]?.id,
  );
  const worldTime = useMemo(
    () => formatWorldTime(simulation.elapsedMonths),
    [simulation.elapsedMonths],
  );
  const overviewEvents = useMemo(() => sortEventsNewestFirst(simulation.events).slice(0, 80), [simulation.events]);
  const nationEvents = useMemo(
    () => filterEventsForNation(simulation.events, eventNationId, Math.max(0, simulation.elapsedMonths - 24)),
    [eventNationId, simulation.elapsedMonths, simulation.events],
  );
  const selectedProvinceStats = useMemo(
    () => buildProvinceStats(selectedProvinceId),
    [selectedProvinceId],
  );
  const selectedNationStats = useMemo(
    () => buildNationStats(
      selectedNationId,
      simulation.nationStockpiles[selectedNationId ?? ""],
      simulation.nationPolicies[selectedNationId ?? ""],
      simulation.nationRelations,
      simulation.diplomacy,
      simulation.spies,
      simulation.elapsedMonths,
    ),
    [selectedNationId, simulation],
  );
  const selectedCityStats = useMemo(
    () => buildCityStats(selectedCityId),
    [selectedCityId],
  );

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setSimulation((currentSimulation) => {
        const currentMonth = currentSimulation.elapsedMonths;
        const nextMonth = currentMonth + speed;
        const nationStockpiles = settleNationStockpiles(
          world,
          currentSimulation.nationStockpiles,
          speed,
        );
        const nationPolicies = advanceNationPolicies(
          world,
          currentSimulation.nationRelations,
          nationStockpiles,
          currentSimulation.nationPolicies,
          currentMonth,
          nextMonth,
        );
        const spyUpdate = advanceSpyNetwork(
          currentSimulation.spies,
          nationPolicies,
          currentSimulation.nationRelations,
          world,
          nextMonth,
        );
        const execution = executeDiplomacyPoliciesWithEvents(
          currentSimulation.diplomacy,
          nationPolicies,
          world,
          nextMonth,
        );
        const evaluation = evaluateDiplomaticProposalsWithEvents(
          execution.diplomacy,
          world,
          spyUpdate.relations,
          nextMonth,
        );
        const newEvents = [...spyUpdate.events, ...execution.events, ...evaluation.events];

        return {
          diplomacy: evaluation.diplomacy,
          elapsedMonths: nextMonth,
          events: [...currentSimulation.events, ...newEvents].slice(-240),
          nationPolicies,
          nationRelations: spyUpdate.relations,
          nationStockpiles,
          spies: spyUpdate.spyNetwork,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, speed]);

  const handleSelectProvince = useCallback((provinceId: string | undefined) => {
    if (provinceId) {
      setSelectedProvinceId(provinceId);
      setSelectedCityId(undefined);
      setCityReturnNationId(undefined);
      setSelectedNationId(undefined);
    }
  }, []);
  const handleSelectCity = useCallback((cityId: string, returnNationId?: string) => {
    const city = world.cityById.get(cityId);
    if (!city) {
      return;
    }

    setSelectedCityId(cityId);
    setCityReturnNationId(returnNationId);
    setSelectedNationId(undefined);
    setSelectedProvinceId(city.provinceId);
  }, []);
  const handleSelectNation = useCallback((nationId: string) => {
    setSelectedCityId(undefined);
    setCityReturnNationId(undefined);
    setSelectedNationId(nationId);
  }, []);
  const handleBackFromCity = useCallback(() => {
    setSelectedCityId(undefined);
    if (cityReturnNationId) {
      setSelectedNationId(cityReturnNationId);
      setCityReturnNationId(undefined);
      return;
    }

    setSelectedNationId(undefined);
  }, [cityReturnNationId]);

  return (
    <main className={buildAppShellClassName(isPanelOpen, isEventPanelOpen)}>
      <aside className="eventPanel" aria-label="Event log">
        <button
          aria-label={isEventPanelOpen ? "Collapse event log" : "Expand event log"}
          className="eventPanelToggle"
          onClick={() => setIsEventPanelOpen((open) => !open)}
          title={isEventPanelOpen ? "Collapse event log" : "Expand event log"}
          type="button"
        >
          {isEventPanelOpen ? "<" : ">"}
        </button>
        {isEventPanelOpen && (
          <EventLogPanel
            eventLogMode={eventLogMode}
            eventNationId={eventNationId}
            nations={world.nations}
            nationEvents={nationEvents}
            onSelectMode={setEventLogMode}
            onSelectNation={setEventNationId}
            overviewEvents={overviewEvents}
          />
        )}
      </aside>
      <section className="mapArea" aria-label="World map">
        <WorldMap
          world={world}
          mapMode={mapMode}
          selectedCityId={selectedCityId}
          selectedProvinceId={selectedProvinceId}
          onSelectCity={handleSelectCity}
          onSelectProvince={handleSelectProvince}
        />
      </section>
      <aside className="sidePanel" aria-label="World controls">
        <button
          aria-label={isPanelOpen ? "Collapse side panel" : "Expand side panel"}
          className="panelToggle"
          onClick={() => setIsPanelOpen((open) => !open)}
          title={isPanelOpen ? "Collapse side panel" : "Expand side panel"}
          type="button"
        >
          {isPanelOpen ? ">" : "<"}
        </button>
        {isPanelOpen && (
          <div className="panelContent" key={selectedCityId ?? selectedNationId ?? "overview"}>
            {selectedCityStats ? (
              <CityDetailPanel
                stats={selectedCityStats}
                onBack={handleBackFromCity}
              />
            ) : selectedNationStats ? (
              <NationDetailPanel
                stats={selectedNationStats}
                onBack={() => setSelectedNationId(undefined)}
                onSelectCity={handleSelectCity}
              />
            ) : (
              <>
                <header>
                  <p className="eyebrow">AI Civilization Sandbox</p>
                  <h1>World Observer</h1>
                </header>
                <section className="timePanel">
                  <div className="timeReadout">
                    <span>World Time</span>
                    <strong>{worldTime}</strong>
                  </div>
                  <button
                    className="primaryControl"
                    onClick={() => setIsRunning((running) => !running)}
                    type="button"
                  >
                    {isRunning ? "Pause" : "Play"}
                  </button>
                  <div className="segmentedControl speedControl" role="group" aria-label="Simulation speed">
                    {speedOptions.map((option) => (
                      <button
                        className={speed === option ? "active" : ""}
                        key={option}
                        onClick={() => setSpeed(option)}
                        type="button"
                      >
                        {option}x
                      </button>
                    ))}
                  </div>
                </section>
                <div className="statGrid">
                  <div>
                    <span>Seed</span>
                    <strong className="smallStat">{world.seed}</strong>
                  </div>
                  <div>
                    <span>Map</span>
                    <strong>
                      {world.width}x{world.height}
                    </strong>
                  </div>
                  <div>
                    <span>Provinces</span>
                    <strong>{world.provinces.length}</strong>
                  </div>
                  <div>
                    <span>Nations</span>
                    <strong>{world.nations.length}</strong>
                  </div>
                  <div>
                    <span>Cities</span>
                    <strong>{world.cities.length}</strong>
                  </div>
                </div>
                <section className="mapModePanel">
                  <h2>Map Mode</h2>
                  <div className="segmentedControl" role="group" aria-label="Map mode">
                    {mapModes.map((mode) => (
                      <button
                        className={mapMode === mode.id ? "active" : ""}
                        key={mode.id}
                        onClick={() => setMapMode(mode.id)}
                        type="button"
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="legend">
                  <h2>Layers</h2>
                  <p><span className="line dashed" /> Province border</p>
                  <p><span className="line solid" /> Nation border</p>
                  <p><span className="line nationLine" /> Nation color edge</p>
                  <p><span className="resourceMark" /> Resource node</p>
                  <p><span className="cityMark" /> City</p>
                </section>
                {selectedProvinceStats && (
                  <section className="provinceDetails">
                    <h2>Selected Province</h2>
                    <div className="provinceTitle">
                      <span style={{ backgroundColor: selectedProvinceStats.nation.color }} />
                      <div>
                        <strong>{selectedProvinceStats.province.name}</strong>
                        <p>{selectedProvinceStats.nation.name}</p>
                      </div>
                    </div>
                    <button
                      className="inspectNationButton"
                      onClick={() => handleSelectNation(selectedProvinceStats.nation.id)}
                      type="button"
                    >
                      View Nation
                    </button>
                    <dl>
                      <div>
                        <dt>Area</dt>
                        <dd>{selectedProvinceStats.province.tileCount} tiles</dd>
                      </div>
                      <div>
                        <dt>Elevation</dt>
                        <dd>{selectedProvinceStats.elevation}%</dd>
                      </div>
                      <div>
                        <dt>Temperature</dt>
                        <dd>{selectedProvinceStats.temperature}%</dd>
                      </div>
                      <div>
                        <dt>Moisture</dt>
                        <dd>{selectedProvinceStats.moisture}%</dd>
                      </div>
                    </dl>
                    <div className="detailBlock">
                      <span>Terrain</span>
                      <p>{formatCounts(selectedProvinceStats.terrainCounts)}</p>
                    </div>
                    <div className="detailBlock">
                      <span>Resources</span>
                      <p>{formatCounts(selectedProvinceStats.resourceCounts) || "None discovered"}</p>
                    </div>
                  </section>
                )}
                <section className="nationList">
                  <h2>Nations</h2>
                  <p className="sectionHint">Click a nation to open its detail panel.</p>
                  {world.nations.map((nation) => (
                    <button
                      className="nationButton"
                      key={nation.id}
                      onClick={() => handleSelectNation(nation.id)}
                      type="button"
                    >
                      <span style={{ backgroundColor: nation.color }} />
                      <strong>{nation.name}</strong>
                      <em>Details</em>
                    </button>
                  ))}
                </section>
              </>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}

type NationStats = NonNullable<ReturnType<typeof buildNationStats>>;
type CityStats = NonNullable<ReturnType<typeof buildCityStats>>;

function EventLogPanel({
  eventLogMode,
  eventNationId,
  nations,
  nationEvents,
  onSelectMode,
  onSelectNation,
  overviewEvents,
}: {
  eventLogMode: "nation" | "overview";
  eventNationId: string;
  nations: Nation[];
  nationEvents: GameEvent[];
  onSelectMode: (mode: "nation" | "overview") => void;
  onSelectNation: (nationId: string) => void;
  overviewEvents: GameEvent[];
}) {
  return (
    <div className="eventPanelContent">
      <header>
        <p className="eyebrow">World History</p>
        <h1>Event Log</h1>
      </header>
      <div className="segmentedControl eventModeControl" role="group" aria-label="Event log mode">
        <button
          className={eventLogMode === "overview" ? "active" : ""}
          onClick={() => onSelectMode("overview")}
          type="button"
        >
          Overview
        </button>
        <button
          className={eventLogMode === "nation" ? "active" : ""}
          onClick={() => onSelectMode("nation")}
          type="button"
        >
          Nation
        </button>
      </div>
      {eventLogMode === "nation" && (
        <section className="eventNationSelector">
          <h2>Nation</h2>
          <div className="eventNationButtons">
            {nations.map((nation) => (
              <button
                className={eventNationId === nation.id ? "active" : ""}
                key={nation.id}
                onClick={() => onSelectNation(nation.id)}
                type="button"
              >
                <span style={{ backgroundColor: nation.color }} />
                {nation.name}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="eventListSection">
        <div className="sectionTitleRow">
          <h2>{eventLogMode === "overview" ? "Recent Major Events" : "Last 2 Years"}</h2>
          <span>{eventLogMode === "overview" ? overviewEvents.length : nationEvents.length}</span>
        </div>
        <EventRows events={eventLogMode === "overview" ? overviewEvents : nationEvents} />
      </section>
    </div>
  );
}

function EventRows({ events }: { events: GameEvent[] }) {
  if (events.length === 0) {
    return <p className="emptyState">No major events yet</p>;
  }

  return (
    <div className="eventRows">
      {events.map((event) => (
        <article className={`eventRow ${event.kind}`} key={event.id}>
          <div>
            <strong>{event.title}</strong>
            <span>{formatWorldTime(event.month)}</span>
          </div>
          <p>{event.description}</p>
        </article>
      ))}
    </div>
  );
}

function CityDetailPanel({
  onBack,
  stats,
}: {
  onBack: () => void;
  stats: CityStats;
}) {
  return (
    <section className="cityDetail">
      <button className="backButton" onClick={onBack} type="button">
        <span aria-hidden="true">{"<"}</span>
        Back
      </button>
      <header className="cityDetailHeader">
        <span style={{ borderColor: stats.nation.color }} />
        <div>
          <p className="eyebrow">{stats.city.isCapital ? "Capital City" : "City Detail"}</p>
          <h1>{stats.city.name}</h1>
          <p>{stats.nation.name} / {stats.province.name}</p>
        </div>
      </header>
      <div className="statGrid">
        <div>
          <span>Population</span>
          <strong className="smallStat">{formatInteger(stats.economy.population)}</strong>
        </div>
        <div>
          <span>Monthly Gold</span>
          <strong className="smallStat">{formatInteger(stats.economy.monthlyGold)}/mo</strong>
        </div>
        <div>
          <span>Army</span>
          <strong className="smallStat">{formatInteger(stats.economy.army)}</strong>
        </div>
        <div>
          <span>Defense</span>
          <strong className="smallStat">Lv {stats.economy.defense}</strong>
        </div>
      </div>
      <section className="buildingSection">
        <div className="sectionTitleRow">
          <h2>Building Slots</h2>
          <span>{stats.buildingSlots} slots</span>
        </div>
        <div className="buildingSlotGrid">
          {Array.from({ length: stats.buildingSlots }, (_, index) => (
            <div className="buildingSlot" key={index}>
              Empty
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function NationDetailPanel({
  onBack,
  onSelectCity,
  stats,
}: {
  onBack: () => void;
  onSelectCity: (cityId: string, returnNationId?: string) => void;
  stats: NationStats;
}) {
  return (
    <section className="nationDetail">
      <button className="backButton" onClick={onBack} type="button">
        <span aria-hidden="true">{"<"}</span>
        Back
      </button>
      <header className="nationDetailHeader">
        <span style={{ backgroundColor: stats.nation.color }} />
        <div>
          <p className="eyebrow">Nation Detail</p>
          <h1>{stats.nation.name}</h1>
        </div>
      </header>
      <div className="statGrid">
        <div>
          <span>Capital</span>
          <strong className="smallStat">{stats.capitalName}</strong>
        </div>
        <div>
          <span>Cities</span>
          <strong>{stats.cityCount}</strong>
        </div>
        <div>
          <span>Population</span>
          <strong className="smallStat">{formatPopulation(stats.cityEconomy.population)}</strong>
        </div>
        <div>
          <span>Monthly Gold</span>
          <strong className="smallStat">{formatInteger(stats.cityEconomy.monthlyGold)}/mo</strong>
        </div>
        <div>
          <span>Treasury</span>
          <strong className="smallStat">{formatInteger(stats.stockpile.gold)}</strong>
        </div>
        <div>
          <span>Army</span>
          <strong className="smallStat">{formatInteger(stats.cityEconomy.army)}</strong>
        </div>
        <div>
          <span>Max Defense</span>
          <strong>Lv {stats.cityEconomy.maxDefense}</strong>
        </div>
        <div>
          <span>Provinces</span>
          <strong>{stats.provinceCount}</strong>
        </div>
        <div>
          <span>Resource Sites</span>
          <strong>{stats.resourceSiteCount}</strong>
        </div>
        <div>
          <span>Deployed Spies</span>
          <strong>{stats.spies.deployed.length}/3</strong>
        </div>
      </div>
      <PolicyPanel monthsUntilReview={stats.monthsUntilPolicyReview} policy={stats.policy} />
      <SpyNetworkPanel spies={stats.spies} currentMonth={stats.currentMonth} />
      <DiplomacyStatusPanel diplomacy={stats.diplomacy} perspectiveNationId={stats.nation.id} />
      <section className="resourceSummary">
        <h2>Major Cities</h2>
        <CityRows
          cities={stats.majorCities}
          onSelectCity={(cityId) => onSelectCity(cityId, stats.nation.id)}
        />
      </section>
      <section className="resourceSummary">
        <h2>Relations</h2>
        <RelationRows perspectiveNationId={stats.nation.id} relations={stats.relations} />
      </section>
      <section className="resourceSummary">
        <h2>Monthly Output</h2>
        <ResourceRows totals={stats.monthlyOutput} suffix="/month" />
      </section>
      <section className="resourceSummary">
        <h2>Current Resources</h2>
        <ResourceRows includeZero totals={stats.currentResources} />
      </section>
      <section className="resourceSummary">
        <h2>Resource Sites</h2>
        <ResourceRows totals={stats.resourceSiteCounts} suffix="sites" />
      </section>
    </section>
  );
}

function DiplomacyStatusPanel({
  diplomacy,
  perspectiveNationId,
}: {
  diplomacy: NationDiplomacySummary;
  perspectiveNationId: string;
}) {
  const totalActive =
    diplomacy.wars.length +
    diplomacy.alliances.length +
    diplomacy.vassalContracts.length +
    (diplomacy.overlordContract ? 1 : 0) +
    diplomacy.truces.length +
    diplomacy.proposals.length;

  return (
    <section className="diplomacyStatusPanel">
      <div className="sectionTitleRow">
        <h2>Diplomacy Status</h2>
        <span>{totalActive} active</span>
      </div>
      {totalActive === 0 ? (
        <p className="emptyState">No wars, treaties, vassals, truces, or proposals</p>
      ) : (
        <div className="diplomacyStatusRows">
          {diplomacy.wars.map((war) => {
            const otherId = getOtherTreatyNationId(
              war.attackerNationId,
              war.defenderNationId,
              perspectiveNationId,
            );
            return (
              <p key={war.id}>
                <span>
                  <strong>War</strong>
                  <em>Started {formatWorldTime(war.startedAtMonth)}</em>
                </span>
                <b>{world.nationById.get(otherId)?.name ?? "Unknown"}</b>
              </p>
            );
          })}
          {diplomacy.alliances.map((alliance) => {
            const otherId = getOtherTreatyNationId(
              alliance.nationAId,
              alliance.nationBId,
              perspectiveNationId,
            );
            return (
              <p key={alliance.id}>
                <span>
                  <strong>Alliance</strong>
                  <em>{alliance.mutualDefense ? "Mutual defense" : "Limited treaty"}</em>
                </span>
                <b>{world.nationById.get(otherId)?.name ?? "Unknown"}</b>
              </p>
            );
          })}
          {diplomacy.overlordContract && (
            <p key={diplomacy.overlordContract.id}>
              <span>
                <strong>Vassal Of</strong>
                <em>{formatTribute(diplomacy.overlordContract)} tribute</em>
              </span>
              <b>{world.nationById.get(diplomacy.overlordContract.overlordNationId)?.name ?? "Unknown"}</b>
            </p>
          )}
          {diplomacy.vassalContracts.map((contract) => (
            <p key={contract.id}>
              <span>
                <strong>Vassal</strong>
                <em>{formatTribute(contract)} tribute</em>
              </span>
              <b>{world.nationById.get(contract.vassalNationId)?.name ?? "Unknown"}</b>
            </p>
          ))}
          {diplomacy.truces.map((truce) => {
            const otherId = getOtherTreatyNationId(
              truce.nationAId,
              truce.nationBId,
              perspectiveNationId,
            );
            return (
              <p key={truce.id}>
                <span>
                  <strong>Truce</strong>
                  <em>Expires {formatWorldTime(truce.expiresAtMonth)}</em>
                </span>
                <b>{world.nationById.get(otherId)?.name ?? "Unknown"}</b>
              </p>
            );
          })}
          {diplomacy.proposals.map((proposal) => (
            <p key={proposal.id}>
              <span>
                <strong>{formatProposalType(proposal.type)}</strong>
                <em>
                  {proposal.fromNationId === perspectiveNationId ? "Sent" : "Received"} / expires{" "}
                  {formatWorldTime(proposal.expiresAtMonth)}
                </em>
              </span>
              <b>{world.nationById.get(
                proposal.fromNationId === perspectiveNationId ? proposal.toNationId : proposal.fromNationId,
              )?.name ?? "Unknown"}</b>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function formatTribute(contract: { goldTributeRate: number; resourceTributeRate: number }) {
  return `${Math.round(contract.goldTributeRate * 100)}% gold / ${Math.round(
    contract.resourceTributeRate * 100,
  )}% resources`;
}

function PolicyPanel({
  monthsUntilReview,
  policy,
}: {
  monthsUntilReview: number;
  policy: NationPolicyState | undefined;
}) {
  if (!policy) {
    return <p className="emptyState">No policy assessment available</p>;
  }

  return (
    <section className="policyPanel">
      <div className="sectionTitleRow">
        <h2>AI Policy</h2>
        <span>Next in {monthsUntilReview} months</span>
      </div>
      <div className="policyRows">
        <PolicyRow label="Expansion" policy={policy.expansion} />
        <PolicyRow label="Economy" policy={policy.economy} />
        <PolicyRow label="Diplomacy" policy={policy.diplomacy} />
      </div>
      <section className="spyMissionSection">
        <div className="sectionTitleRow">
          <h2>Spy Missions</h2>
          <span>{policy.spyMissions.length}/3 assigned</span>
        </div>
        <SpyMissionRows missions={policy.spyMissions} />
      </section>
    </section>
  );
}

function SpyNetworkPanel({
  currentMonth,
  spies,
}: {
  currentMonth: number;
  spies: NationSpySummary;
}) {
  return (
    <section className="spyNetworkPanel">
      <div className="sectionTitleRow">
        <h2>Spy Network</h2>
        <span>{spies.deployed.length}/3 deployed</span>
      </div>
      {spies.deployed.length === 0 ? (
        <p className="emptyState">No spies currently deployed</p>
      ) : (
        <div className="spyNetworkRows">
          {spies.deployed.map((operation) => {
            const target = world.nationById.get(operation.targetNationId)?.name ?? "Unknown nation";
            const secondaryTarget = operation.secondaryTargetNationId
              ? world.nationById.get(operation.secondaryTargetNationId)?.name
              : undefined;
            const monthsUntilActive = Math.max(0, operation.activatesAtMonth - currentMonth);

            return (
              <p key={operation.id}>
                <span>
                  <strong>{formatSpyMissionPolicy(operation.policy)}</strong>
                  <em>
                    {target}{secondaryTarget ? ` vs ${secondaryTarget}` : ""}
                  </em>
                </span>
                <b>
                  {operation.status === "deploying"
                    ? `Active in ${monthsUntilActive} mo`
                    : "Active"}
                  <small>Review {formatWorldTime(operation.expiresAtMonth)}</small>
                </b>
              </p>
            );
          })}
        </div>
      )}
      <div className="sectionTitleRow spyIntelTitle">
        <h2>Active Intelligence</h2>
        <span>{spies.intelligenceReports.length}</span>
      </div>
      {spies.intelligenceReports.length === 0 ? (
        <p className="emptyState">No active intelligence reports</p>
      ) : (
        <div className="spyNetworkRows">
          {spies.intelligenceReports.map((report) => (
            <p key={report.id}>
              <span>
                <strong>{world.nationById.get(report.targetNationId)?.name ?? "Unknown nation"}</strong>
                <em>
                  Army {formatInteger(report.army)} / Gold {formatInteger(report.monthlyGold)}/mo
                </em>
              </span>
              <b>
                {formatIntelResources(report.monthlyResources)}
                <small>
                  {report.expiresAtMonth
                    ? `Expires ${formatWorldTime(report.expiresAtMonth)}`
                    : "Current report"}
                </small>
              </b>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function PolicyRow({
  label,
  policy,
}: {
  label: string;
  policy: NationPolicyState["expansion" | "economy" | "diplomacy"];
}) {
  const targetNation = policy.targetNationId ? world.nationById.get(policy.targetNationId) : undefined;

  return (
    <p>
      <span>
        <strong>{label}</strong>
        <em>{policy.rationale}</em>
      </span>
      <b>
        {policy.label}
        {(targetNation || policy.targetResource) && (
          <small>
            {targetNation?.name}
            {targetNation && policy.targetResource ? " / " : ""}
            {policy.targetResource ? formatResourceName(policy.targetResource) : ""}
          </small>
        )}
      </b>
    </p>
  );
}

function SpyMissionRows({ missions }: { missions: NationPolicyState["spyMissions"] }) {
  if (missions.length === 0) {
    return <p className="emptyState">No active spy mission intent</p>;
  }

  return (
    <div className="spyMissionRows">
      {missions.map((mission) => {
        const targetNation = mission.targetNationId ? world.nationById.get(mission.targetNationId) : undefined;
        const secondaryTarget = mission.secondaryTargetNationId
          ? world.nationById.get(mission.secondaryTargetNationId)
          : undefined;

        return (
          <p key={mission.id}>
            <span>
              <strong>{mission.label}</strong>
              <em>{mission.rationale}</em>
            </span>
            <b>
              {targetNation?.name ?? "No target"}
              {secondaryTarget && <small>vs {secondaryTarget.name}</small>}
            </b>
          </p>
        );
      })}
    </div>
  );
}

function CityRows({
  cities,
  onSelectCity,
}: {
  cities: City[];
  onSelectCity?: (cityId: string) => void;
}) {
  if (cities.length === 0) {
    return <p className="emptyState">No cities founded</p>;
  }

  return (
    <div className="cityRows">
      {cities.map((city) => {
        const province = world.provinceById.get(city.provinceId);
        const content = (
          <>
            <span>
              <strong>{city.name}</strong>
              <em>{province?.name ?? "Unknown province"}</em>
            </span>
            <b>
              {city.isCapital ? "Capital" : `Lv ${city.level}`}
              <small>{formatPopulation(city.population)}</small>
            </b>
          </>
        );

        if (onSelectCity) {
          return (
            <button key={city.id} onClick={() => onSelectCity(city.id)} type="button">
              {content}
            </button>
          );
        }

        return (
          <p key={city.id}>
            {content}
          </p>
        );
      })}
    </div>
  );
}

function RelationRows({
  perspectiveNationId,
  relations,
}: {
  perspectiveNationId?: string;
  relations: NationRelation[];
}) {
  if (relations.length === 0) {
    return <p className="emptyState">No known relations</p>;
  }

  return (
    <div className="relationRows">
      {relations.map((relation) => {
        const otherId = perspectiveNationId ? otherNationId(relation, perspectiveNationId) : undefined;
        const nationA = world.nationById.get(relation.nationAId);
        const nationB = world.nationById.get(relation.nationBId);
        const label = otherId
          ? world.nationById.get(otherId)?.name ?? "Unknown nation"
          : `${nationA?.name ?? "Unknown"} / ${nationB?.name ?? "Unknown"}`;

        return (
          <p key={`${relation.nationAId}-${relation.nationBId}`}>
            <span>
              <strong>{label}</strong>
              <em>Attitude {relation.attitude}</em>
            </span>
            <b className={`attitudeBadge ${attitudeClassName(relation.attitude)}`}>
              {getAttitudeLabel(relation.attitude)}
            </b>
          </p>
        );
      })}
    </div>
  );
}

function ResourceRows({
  includeZero = false,
  suffix = "",
  totals,
}: {
  includeZero?: boolean;
  suffix?: string;
  totals: ResourceTotals;
}) {
  const entries = Object.entries(totals).filter(([, amount]) => includeZero || amount > 0);

  if (entries.length === 0) {
    return <p className="emptyState">No resources discovered</p>;
  }

  return (
    <div className="resourceRows">
      {entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([resource, amount]) => (
          <p key={resource}>
            <span>{formatResourceName(resource as Resource)}</span>
            <strong>
              {amount}
              {suffix ? ` ${suffix}` : ""}
            </strong>
          </p>
        ))}
    </div>
  );
}

function attitudeClassName(attitude: number) {
  const label = getAttitudeLabel(attitude).toLowerCase();
  return label as "friendly" | "hostile" | "neutral" | "trusted" | "wary";
}

function formatWorldTime(elapsedMonths: number) {
  const year = Math.floor(elapsedMonths / 12) + 1;
  const month = (elapsedMonths % 12) + 1;
  return `Year ${year}, Month ${month}`;
}

function formatPopulation(population: number) {
  if (population >= 1000000) {
    return `${(population / 1000000).toFixed(1)}M`;
  }

  return `${Math.round(population / 1000)}K`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatIntelResources(resources: ResourceTotals) {
  const output = Object.entries(resources)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${formatResourceName(resource as Resource)} ${amount}`)
    .join(", ");
  return output || "No resources";
}

function buildCityStats(cityId: string | undefined) {
  if (!cityId) {
    return undefined;
  }

  const city = world.cityById.get(cityId);
  if (!city) {
    return undefined;
  }

  const nation = world.nationById.get(city.nationId);
  const province = world.provinceById.get(city.provinceId);
  if (!nation || !province) {
    return undefined;
  }
  const economy = calculateCityEconomy(city, world);

  return {
    buildingSlots: city.isCapital ? 12 : 8,
    city,
    economy,
    nation,
    province,
  };
}

function buildNationStats(
  nationId: string | undefined,
  stockpile: NationStockpile | undefined,
  policy: NationPolicyState | undefined,
  relations: NationRelations,
  diplomacy: Parameters<typeof getNationDiplomacySummary>[0],
  spies: SpyNetwork,
  elapsedMonths: number,
) {
  if (!nationId) {
    return undefined;
  }

  const nation = world.nationById.get(nationId);
  if (!nation) {
    return undefined;
  }

  const provinces = world.provinces.filter((province) => province.nationId === nationId);
  const provinceIds = new Set(provinces.map((province) => province.id));
  const tiles = world.tiles.filter((tile) => tile.provinceId && provinceIds.has(tile.provinceId));
  const cities = world.cities
    .filter((city) => city.nationId === nationId)
    .sort((a, b) => Number(b.isCapital) - Number(a.isCapital) || b.population - a.population);
  const capitalCity =
    (nation.capitalCityId ? world.cityById.get(nation.capitalCityId) : undefined) ??
    cities.find((city) => city.isCapital);
  const capitalName = capitalCity?.name ?? world.provinceById.get(nation.capitalProvinceId)?.name ?? "Unknown";
  const cityEconomy = calculateNationCityEconomy(nationId, world);
  const monthlyIncome = calculateNationMonthlyIncome(world, nationId);
  const monthlyOutput: ResourceTotals = {};
  const resourceSiteCounts: ResourceTotals = {};

  for (const tile of tiles) {
    const yieldValue = getTileMonthlyYield(tile);
    if (!yieldValue) {
      continue;
    }

    addYield(monthlyOutput, yieldValue);
    resourceSiteCounts[yieldValue.resource] = (resourceSiteCounts[yieldValue.resource] ?? 0) + 1;
  }

  return {
    capitalName,
    cityCount: cities.length,
    cityEconomy,
    currentResources: stockpile?.resources ?? {},
    diplomacy: getNationDiplomacySummary(diplomacy, nationId),
    majorCities: cities.slice(0, 6),
    monthlyIncome,
    monthlyOutput,
    monthsUntilPolicyReview: policy ? Math.max(0, policy.nextDecisionMonth - elapsedMonths) : 0,
    nation,
    policy,
    provinceCount: provinces.length,
    relations: getNationRelationsFor(relations, nationId),
    resourceSiteCount: Object.values(resourceSiteCounts).reduce((sum, count) => sum + count, 0),
    resourceSiteCounts,
    stockpile: stockpile ?? { gold: 0, resources: {} },
    spies: getNationSpySummary(spies, nationId, elapsedMonths),
    currentMonth: elapsedMonths,
  };
}

function buildProvinceStats(provinceId: string | undefined) {
  if (!provinceId) {
    return undefined;
  }

  const province = world.provinceById.get(provinceId);
  if (!province) {
    return undefined;
  }

  const nation = world.nationById.get(province.nationId);
  if (!nation) {
    return undefined;
  }

  const tiles = world.tiles.filter((tile) => tile.provinceId === provinceId);
  const sums = tiles.reduce(
    (total, tile) => ({
      elevation: total.elevation + tile.elevation,
      temperature: total.temperature + tile.temperature,
      moisture: total.moisture + tile.moisture,
    }),
    { elevation: 0, temperature: 0, moisture: 0 },
  );

  return {
    province,
    nation,
    elevation: percentAverage(sums.elevation, tiles),
    temperature: percentAverage(sums.temperature, tiles),
    moisture: percentAverage(sums.moisture, tiles),
    terrainCounts: countBy(tiles, (tile) => tile.terrain),
    resourceCounts: countBy(
      tiles.filter((tile) => tile.resource),
      (tile) => tile.resource,
    ),
  };
}

function percentAverage(sum: number, tiles: Tile[]) {
  if (tiles.length === 0) {
    return 0;
  }

  return Math.round((sum / tiles.length) * 100);
}

function countBy<T extends string>(
  tiles: Tile[],
  selector: (tile: Tile) => T | undefined,
) {
  return tiles.reduce<Record<T, number>>(
    (counts, tile) => {
      const key = selector(tile);
      if (key) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
    {} as Record<T, number>,
  );
}

function formatCounts(counts: Partial<Record<Terrain | Resource, number>>) {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}
