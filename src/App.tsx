import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type MapMode, WorldMap } from "./components/WorldMap";
import { NationModelConfiguration } from "./components/NationModelConfiguration";
import { buildDemoWorld } from "./world/buildDemoWorld";
import { calculateCityEconomy, calculateNationCityEconomy } from "./world/cityEconomy";
import {
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
  type NationPolicyState,
} from "./world/policyAI";
import {
  getAttitudeLabel,
  getNationRelationsFor,
  otherNationId,
  type NationRelation,
  type NationRelations,
} from "./world/relationships";
import {
  calculateNationMonthlyIncome,
  type NationStockpile,
} from "./world/settlement";
import {
  advanceSpyNetwork,
  formatSpyMissionPolicy,
  getNationSpySummary,
  type NationSpySummary,
  type SpyNetwork,
} from "./world/spies";
import type { City, Nation, Resource, Terrain, Tile } from "./world/types";
import {
  getAllArmyGroups,
  getNationWarSummary,
  unitStats,
  unitTypes,
  type ArmyStance,
  type ArmyUnits,
  type MilitaryState,
  type NationWarSummary,
} from "./world/war";
import {
  advanceSimulationTurn,
  createInitialSimulationState,
  type SimulationState,
  type DefeatedNationRecord,
  type TurnProgress,
} from "./world/turnSimulation";
import { isNationDefeated } from "./world/nationStatus";
import { localizeText, type Language } from "./world/localization";

const world = buildDemoWorld();
const mapModes: { id: MapMode; label: string }[] = [
  { id: "political", label: "Political" },
  { id: "terrain", label: "Terrain" },
  { id: "resources", label: "Resources" },
];
const speedOptions = [1, 2, 5] as const;
type SimulationSpeed = (typeof speedOptions)[number];

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
  const appRootRef = useRef<HTMLElement>(null);
  const [language, setLanguage] = useState<Language>("zh");
  const [mapMode, setMapMode] = useState<MapMode>("political");
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [eventLogMode, setEventLogMode] = useState<"nation" | "overview">("overview");
  const [eventNationId, setEventNationId] = useState<string | undefined>();
  const [isEventPanelOpen, setIsEventPanelOpen] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isConfigurationOpen, setIsConfigurationOpen] = useState(false);
  const [simulation, setSimulation] = useState<SimulationState>(() => createInitialSimulationState(world));
  const simulationRef = useRef(simulation);
  const turnInProgressRef = useRef(false);
  const [turnProgress, setTurnProgress] = useState<TurnProgress>({
    turnNumber: 1,
    completedNationIds: [],
    totalNations: world.nations.length,
    phase: "idle",
  });
  const [selectedCityId, setSelectedCityId] = useState<string | undefined>();
  const [cityReturnNationId, setCityReturnNationId] = useState<string | undefined>();
  const [selectedNationId, setSelectedNationId] = useState<string | undefined>();
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | undefined>(
    world.provinces[0]?.id,
  );
  useDomLocalization(appRootRef, language);
  const worldTime = useMemo(
    () => formatWorldTime(simulation.elapsedMonths),
    [simulation.elapsedMonths],
  );
  const overviewEvents = useMemo(() => sortEventsNewestFirst(simulation.events).slice(0, 80), [simulation.events]);
  const nationEvents = useMemo(
    () => eventNationId
      ? filterEventsForNation(simulation.events, eventNationId, Math.max(0, simulation.elapsedMonths - 24)).slice(0, 20)
      : [],
    [eventNationId, simulation.elapsedMonths, simulation.events],
  );
  const selectedEventNation = useMemo(
    () => eventNationId ? world.nationById.get(eventNationId) : undefined,
    [eventNationId],
  );
  const visibleArmyGroups = useMemo(
    () => getAllArmyGroups(simulation.military),
    [simulation.military],
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
      simulation.defeatedNations,
      simulation.diplomacy,
      simulation.military,
      simulation.spies,
      simulation.elapsedMonths,
    ),
    [selectedNationId, simulation],
  );
  const selectedCityStats = useMemo(
    () => buildCityStats(selectedCityId),
    [selectedCityId],
  );

  const runNextTurn = useCallback(async () => {
    if (turnInProgressRef.current) {
      return;
    }

    turnInProgressRef.current = true;
    try {
      const next = await advanceSimulationTurn(world, simulationRef.current, undefined, setTurnProgress);
      simulationRef.current = next;
      setSimulation(next);
      setTurnProgress({
        turnNumber: next.elapsedMonths + 1,
        completedNationIds: [],
        totalNations: world.nations.length,
        phase: "idle",
      });
    } catch (error) {
      console.error("国家回合执行失败，本回合未推进：", error);
      setIsRunning(false);
    } finally {
      turnInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const loop = async () => {
      await runNextTurn();
      if (!cancelled) {
        timer = window.setTimeout(loop, Math.round(1000 / speed));
      }
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [isRunning, runNextTurn, speed]);

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
    <main
      className={isConfigurationOpen ? "configurationSurface" : buildAppShellClassName(isPanelOpen, isEventPanelOpen)}
      ref={appRootRef}
      lang={language === "zh" ? "zh-CN" : "en"}
    >
      {isConfigurationOpen ? (
        <NationModelConfiguration
          language={language}
          onBack={() => setIsConfigurationOpen(false)}
          world={world}
        />
      ) : (
        <>
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
            onBackToNationList={() => setEventNationId(undefined)}
            onSelectMode={setEventLogMode}
            onSelectNation={setEventNationId}
            overviewEvents={overviewEvents}
            selectedEventNation={selectedEventNation}
          />
        )}
      </aside>
      <section className="mapArea" aria-label="World map">
        <WorldMap
          world={world}
          mapMode={mapMode}
          mapRevision={simulation.mapRevision}
          armyGroups={visibleArmyGroups}
          selectedCityId={selectedCityId}
          selectedProvinceId={selectedProvinceId}
          onSelectCity={handleSelectCity}
          onSelectProvince={handleSelectProvince}
          language={language}
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
                  <label className="languageControl">
                    <span>{language === "zh" ? "游戏语言" : "Game Language"}</span>
                    <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <button
                    className="aiConfigEntry"
                    onClick={() => {
                      setIsRunning(false);
                      setIsConfigurationOpen(true);
                    }}
                    type="button"
                  >
                    <span>AI Configuration</span>
                    <small>Models &amp; personalities</small>
                  </button>
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
                  <button className="secondaryControl" disabled={turnProgress.phase !== "idle"} onClick={() => void runNextTurn()} type="button">
                    Next Turn
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
                  <div className="turnProgress" aria-live="polite">
                    <span>Turn Progress</span>
                    <strong>
                      {turnProgress.phase === "idle"
                        ? `Turn ${simulation.elapsedMonths + 1}`
                        : turnProgress.phase === "resolving"
                          ? `Resolving · ${turnProgress.completedNationIds.length} of ${turnProgress.totalNations} nations completed`
                          : `Waiting for ${world.nationById.get(turnProgress.activeNationId ?? "")?.name ?? "Unknown nation"} · ${turnProgress.completedNationIds.length} of ${turnProgress.totalNations} nations completed`}
                    </strong>
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
        </>
      )}
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
  onBackToNationList,
  onSelectMode,
  onSelectNation,
  overviewEvents,
  selectedEventNation,
}: {
  eventLogMode: "nation" | "overview";
  eventNationId: string | undefined;
  nations: Nation[];
  nationEvents: GameEvent[];
  onBackToNationList: () => void;
  onSelectMode: (mode: "nation" | "overview") => void;
  onSelectNation: (nationId: string) => void;
  overviewEvents: GameEvent[];
  selectedEventNation: Nation | undefined;
}) {
  const handleSelectOverview = () => {
    onBackToNationList();
    onSelectMode("overview");
  };
  const handleSelectNationMode = () => {
    onBackToNationList();
    onSelectMode("nation");
  };

  return (
    <div className="eventPanelContent">
      <header>
        <p className="eyebrow">World History</p>
        <h1>Event Log</h1>
      </header>
      <div className="segmentedControl eventModeControl" role="group" aria-label="Event log mode">
        <button
          className={eventLogMode === "overview" ? "active" : ""}
          onClick={handleSelectOverview}
          type="button"
        >
          Overview
        </button>
        <button
          className={eventLogMode === "nation" ? "active" : ""}
          onClick={handleSelectNationMode}
          type="button"
        >
          Nation
        </button>
      </div>
      {eventLogMode === "nation" && !selectedEventNation && (
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
      {eventLogMode === "overview" && (
        <section className="eventListSection">
          <div className="sectionTitleRow">
            <h2>Recent Major Events</h2>
            <span>{overviewEvents.length}</span>
          </div>
          <EventRows events={overviewEvents} />
        </section>
      )}
      {eventLogMode === "nation" && selectedEventNation && (
        <section className="eventNationDetail">
          <button className="backButton compactBackButton" onClick={onBackToNationList} type="button">
            <span aria-hidden="true">{"<"}</span>
            Back
          </button>
          <header className="eventNationDetailHeader">
            <span style={{ borderColor: selectedEventNation.color }} />
            <div>
              <p className="eyebrow">Nation</p>
              <h2>{selectedEventNation.name}</h2>
            </div>
          </header>
          <section className="eventListSection">
            <div className="sectionTitleRow">
              <h2>Last 2 Years</h2>
              <span>{nationEvents.length}/20</span>
            </div>
            <EventRows events={nationEvents} />
          </section>
        </section>
      )}
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
  if (stats.isDefeated) {
    const victor = stats.defeatRecord ? world.nationById.get(stats.defeatRecord.victorNationId) : undefined;
    return (
      <section className="nationDetail">
        <button className="backButton" onClick={onBack} type="button">
          <span aria-hidden="true">{"<"}</span>
          Back
        </button>
        <header className="nationDetailHeader defeatedNationHeader">
          <span style={{ backgroundColor: stats.nation.color }} />
          <div>
            <p className="eyebrow">Defeated Nation</p>
            <h1>{stats.nation.name}</h1>
          </div>
        </header>
        <section className="defeatedNationNotice">
          <h2>Nation Defeated</h2>
          <p><span>Defeated At</span><strong>{stats.defeatRecord ? formatWorldTime(stats.defeatRecord.defeatedAtMonth) : "Unknown"}</strong></p>
          <p><span>Destroyed By</span><strong>{victor?.name ?? "Unknown"}</strong></p>
        </section>
      </section>
    );
  }

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
          <span>Soldiers</span>
          <strong className="smallStat">{formatInteger(stats.military.totalSoldiers)}</strong>
        </div>
        <div>
          <span>Morale</span>
          <strong>{Math.round(stats.military.army.morale * 100)}%</strong>
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
      <MilitaryPanel military={stats.military} />
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

function MilitaryPanel({ military }: { military: NationWarSummary }) {
  return (
    <section className="militaryPanel">
      <div className="sectionTitleRow">
        <h2>Military</h2>
        <span>{formatInteger(military.totalSoldiers)} soldiers</span>
      </div>
      <div className="militaryOverview">
        <p>
          <span>Monthly Upkeep</span>
          <strong>{formatDecimal(military.monthlyUpkeep, 1)} gold</strong>
        </p>
        <p>
          <span>Attack / Defense</span>
          <strong>{formatInteger(military.attackPower)} / {formatInteger(military.defensePower)}</strong>
        </p>
      </div>
      <div className="militaryUnitRows">
        {unitTypes.map((type) => (
          <p key={type}>
            <span>
              <strong>{unitStats[type].label}</strong>
              <em>
                HP {unitStats[type].hp} / Speed {unitStats[type].speed} / Upkeep {unitStats[type].upkeepGold}
              </em>
            </span>
            <b>{formatInteger(military.army.units[type])}</b>
          </p>
        ))}
      </div>
      <div className="sectionTitleRow warStatusTitle">
        <h2>Field Army Groups</h2>
        <span>{military.armyGroups.length}</span>
      </div>
      {military.armyGroups.length === 0 ? (
        <p className="emptyState">No field army groups deployed</p>
      ) : (
        <div className="warRows">
          {military.armyGroups.slice(0, 6).map((group) => (
            <p key={group.id}>
              <span>
                <strong>{formatArmyStance(group.stance)}</strong>
                <em>
                  {world.provinceById.get(group.locationProvinceId)?.name ?? group.locationProvinceId}
                  {group.destinationProvinceId
                    ? ` -> ${world.provinceById.get(group.destinationProvinceId)?.name ?? group.destinationProvinceId}`
                    : ""}
                </em>
              </span>
              <b>
                {formatInteger(countUnits(group.units))}
                <small>{group.pathProvinceIds.length} steps</small>
              </b>
            </p>
          ))}
        </div>
      )}
      <div className="sectionTitleRow warStatusTitle">
        <h2>City Garrisons</h2>
        <span>{military.cityGarrisons.length}</span>
      </div>
      {military.cityGarrisons.length === 0 ? (
        <p className="emptyState">No city garrisons</p>
      ) : (
        <div className="warRows">
          {military.cityGarrisons.slice(0, 6).map((garrison) => (
            <p key={garrison.cityId}>
              <span>
                <strong>{garrison.cityName}</strong>
                <em>{garrison.provinceName}</em>
              </span>
              <b>
                {formatInteger(garrison.totalSoldiers)}
                <small>{formatUnitMix(garrison.units)}</small>
              </b>
            </p>
          ))}
        </div>
      )}
      <div className="sectionTitleRow warStatusTitle">
        <h2>Recruitment Queue</h2>
        <span>{military.recruitmentQueue.length}</span>
      </div>
      {military.recruitmentQueue.length === 0 ? (
        <p className="emptyState">No active recruitment orders</p>
      ) : (
        <div className="warRows">
          {military.recruitmentQueue.slice(0, 6).map((order) => (
            <p key={order.id}>
              <span>
                <strong>{unitStats[order.unitType].label}</strong>
                <em>{world.cityById.get(order.cityId)?.name ?? order.cityId}</em>
              </span>
              <b>
                {formatInteger(order.amount)}
                <small>Ready {formatWorldTime(order.completesAtMonth)}</small>
              </b>
            </p>
          ))}
        </div>
      )}
      <div className="sectionTitleRow warStatusTitle">
        <h2>Active Wars</h2>
        <span>{military.activeWars.length}</span>
      </div>
      {military.activeWars.length === 0 ? (
        <p className="emptyState">No active wars</p>
      ) : (
        <div className="warRows">
          {military.activeWars.map((war) => (
            <p key={war.id}>
              <span>
                <strong>{world.nationById.get(war.enemyNationId)?.name ?? "Unknown nation"}</strong>
                <em>
                  Started {formatWorldTime(war.startedAtMonth)}
                  {war.targetProvinceId
                    ? ` / front ${world.provinceById.get(war.targetProvinceId)?.name ?? war.targetProvinceId}`
                    : ""}
                </em>
              </span>
              <b>
                Score {formatDecimal(war.attackerScore ?? 0, 1)} / {formatDecimal(war.defenderScore ?? 0, 1)}
                <small>{war.battleCount ?? 0} battles</small>
              </b>
            </p>
          ))}
        </div>
      )}
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

function formatDecimal(value: number, digits: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatIntelResources(resources: ResourceTotals) {
  const output = Object.entries(resources)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${formatResourceName(resource as Resource)} ${amount}`)
    .join(", ");
  return output || "No resources";
}

function countUnits(units: ArmyUnits) {
  return unitTypes.reduce((sum, type) => sum + units[type], 0);
}

function formatUnitMix(units: ArmyUnits) {
  return unitTypes
    .filter((type) => units[type] > 0)
    .map((type) => `${unitStats[type].label.split(" ")[0]} ${units[type]}`)
    .join(", ");
}

function formatArmyStance(stance: ArmyStance) {
  switch (stance) {
    case "attack":
      return "Attack";
    case "defend":
      return "Defend";
    case "garrison":
      return "Garrison";
    case "raid":
      return "Raid";
    case "rally":
      return "Rally";
    case "retreat":
      return "Retreat";
  }
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
  defeatedNations: Record<string, DefeatedNationRecord>,
  diplomacy: Parameters<typeof getNationDiplomacySummary>[0],
  military: MilitaryState,
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
  const defeatRecord = defeatedNations[nationId];
  const isDefeated = Boolean(defeatRecord) || isNationDefeated(world, nationId);
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
    defeatRecord,
    diplomacy: getNationDiplomacySummary(diplomacy, nationId),
    majorCities: cities.slice(0, 6),
    isDefeated,
    monthlyIncome,
    monthlyOutput,
    monthsUntilPolicyReview: policy ? Math.max(0, policy.nextDecisionMonth - elapsedMonths) : 0,
    military: getNationWarSummary(diplomacy, military, world, nationId),
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

/**
 * 对既有原型 DOM 做集中式本地化，保留英文源文本以支持无损往返切换。
 * Pixi 画布中的文本由 WorldMap 组件直接按语言渲染。
 */
function useDomLocalization(rootRef: React.RefObject<HTMLElement | null>, language: Language) {
  const sourceTextsRef = useRef(new WeakMap<Text, string>());
  const sourceAttributesRef = useRef(new WeakMap<Element, Map<string, string>>());
  const previousLanguageRef = useRef<Language>(language);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const attributes = ["aria-label", "title", "placeholder"];

    const applyText = (node: Text, comparisonLanguage = language) => {
      const current = node.data;
      const previousSource = sourceTextsRef.current.get(node);
      const previousLocalized = previousSource === undefined ? undefined : localizeText(previousSource, comparisonLanguage, world);
      const source = previousSource === undefined || (current !== previousSource && current !== previousLocalized)
        ? current
        : previousSource;
      sourceTextsRef.current.set(node, source);
      const localized = localizeText(source, language, world);
      if (node.data !== localized) node.data = localized;
    };

    const applyElement = (element: Element, comparisonLanguage = language) => {
      const stored = sourceAttributesRef.current.get(element) ?? new Map<string, string>();
      for (const attribute of attributes) {
        const current = element.getAttribute(attribute);
        if (current === null) continue;
        const previousSource = stored.get(attribute);
        const previousLocalized = previousSource === undefined ? undefined : localizeText(previousSource, comparisonLanguage, world);
        const source = previousSource === undefined || (current !== previousSource && current !== previousLocalized)
          ? current
          : previousSource;
        stored.set(attribute, source);
        const localized = localizeText(source, language, world);
        if (current !== localized) element.setAttribute(attribute, localized);
      }
      sourceAttributesRef.current.set(element, stored);
    };

    const applyTree = (node: Node, comparisonLanguage = language) => {
      if (node.nodeType === Node.TEXT_NODE) applyText(node as Text, comparisonLanguage);
      if (node.nodeType === Node.ELEMENT_NODE) {
        applyElement(node as Element, comparisonLanguage);
        node.childNodes.forEach((child) => applyTree(child, comparisonLanguage));
      }
    };

    applyTree(root, previousLanguageRef.current);
    previousLanguageRef.current = language;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") applyText(mutation.target as Text);
        mutation.addedNodes.forEach((node) => applyTree(node));
        if (mutation.type === "attributes") applyElement(mutation.target as Element);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [language, rootRef]);
}

function formatCounts(counts: Partial<Record<Terrain | Resource, number>>) {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}
