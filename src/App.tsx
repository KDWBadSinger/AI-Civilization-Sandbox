import { useCallback, useEffect, useMemo, useState } from "react";
import { type MapMode, WorldMap } from "./components/WorldMap";
import { buildDemoWorld } from "./world/buildDemoWorld";
import { addYield, formatResourceName, getTileMonthlyYield, type ResourceTotals } from "./world/economy";
import type { Resource, Terrain, Tile } from "./world/types";

const world = buildDemoWorld();
const mapModes: { id: MapMode; label: string }[] = [
  { id: "political", label: "Political" },
  { id: "terrain", label: "Terrain" },
  { id: "resources", label: "Resources" },
];
const speedOptions = [1, 2, 5] as const;
type SimulationSpeed = (typeof speedOptions)[number];

export default function App() {
  const [mapMode, setMapMode] = useState<MapMode>("political");
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [elapsedMonths, setElapsedMonths] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [selectedNationId, setSelectedNationId] = useState<string | undefined>();
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | undefined>(
    world.provinces[0]?.id,
  );
  const worldTime = useMemo(() => formatWorldTime(elapsedMonths), [elapsedMonths]);
  const selectedProvinceStats = useMemo(
    () => buildProvinceStats(selectedProvinceId),
    [selectedProvinceId],
  );
  const selectedNationStats = useMemo(
    () => buildNationStats(selectedNationId, elapsedMonths),
    [elapsedMonths, selectedNationId],
  );

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMonths((current) => current + speed);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, speed]);

  const handleSelectProvince = useCallback((provinceId: string | undefined) => {
    if (provinceId) {
      setSelectedProvinceId(provinceId);
    }
  }, []);
  const handleSelectNation = useCallback((nationId: string) => {
    setSelectedNationId(nationId);
  }, []);

  return (
    <main className={isPanelOpen ? "appShell" : "appShell panelCollapsed"}>
      <section className="mapArea" aria-label="World map">
        <WorldMap
          world={world}
          mapMode={mapMode}
          selectedProvinceId={selectedProvinceId}
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
          <div className="panelContent" key={selectedNationId ?? "overview"}>
            {selectedNationStats ? (
              <NationDetailPanel
                elapsedMonths={elapsedMonths}
                stats={selectedNationStats}
                onBack={() => setSelectedNationId(undefined)}
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

function NationDetailPanel({
  elapsedMonths,
  onBack,
  stats,
}: {
  elapsedMonths: number;
  onBack: () => void;
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
          <span>Provinces</span>
          <strong>{stats.provinceCount}</strong>
        </div>
        <div>
          <span>Resource Sites</span>
          <strong>{stats.resourceSiteCount}</strong>
        </div>
        <div>
          <span>Elapsed</span>
          <strong>{elapsedMonths}</strong>
        </div>
      </div>
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

function formatWorldTime(elapsedMonths: number) {
  const year = Math.floor(elapsedMonths / 12) + 1;
  const month = (elapsedMonths % 12) + 1;
  return `Year ${year}, Month ${month}`;
}

function buildNationStats(nationId: string | undefined, elapsedMonths: number) {
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
  const capitalName = world.provinceById.get(nation.capitalProvinceId)?.name ?? "Unknown";
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
    currentResources: multiplyTotals(monthlyOutput, elapsedMonths),
    monthlyOutput,
    nation,
    provinceCount: provinces.length,
    resourceSiteCount: Object.values(resourceSiteCounts).reduce((sum, count) => sum + count, 0),
    resourceSiteCounts,
  };
}

function multiplyTotals(totals: ResourceTotals, multiplier: number): ResourceTotals {
  return Object.fromEntries(
    Object.entries(totals).map(([resource, amount]) => [resource, amount * multiplier]),
  ) as ResourceTotals;
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
