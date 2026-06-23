import { useCallback, useMemo, useState } from "react";
import { type MapMode, WorldMap } from "./components/WorldMap";
import { buildDemoWorld } from "./world/buildDemoWorld";
import type { Resource, Terrain, Tile } from "./world/types";

const world = buildDemoWorld();
const mapModes: { id: MapMode; label: string }[] = [
  { id: "political", label: "Political" },
  { id: "terrain", label: "Terrain" },
  { id: "resources", label: "Resources" },
];

export default function App() {
  const [mapMode, setMapMode] = useState<MapMode>("political");
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | undefined>(
    world.provinces[0]?.id,
  );
  const selectedProvinceStats = useMemo(
    () => buildProvinceStats(selectedProvinceId),
    [selectedProvinceId],
  );
  const handleSelectProvince = useCallback((provinceId: string | undefined) => {
    if (provinceId) {
      setSelectedProvinceId(provinceId);
    }
  }, []);

  return (
    <main className="appShell">
      <section className="mapArea" aria-label="World map">
        <WorldMap
          world={world}
          mapMode={mapMode}
          selectedProvinceId={selectedProvinceId}
          onSelectProvince={handleSelectProvince}
        />
      </section>
      <aside className="sidePanel">
        <header>
          <p className="eyebrow">AI Civilization Sandbox</p>
          <h1>World Observer</h1>
        </header>
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
          {world.nations.map((nation) => (
            <p key={nation.id}>
              <span style={{ backgroundColor: nation.color }} />
              {nation.name}
            </p>
          ))}
        </section>
      </aside>
    </main>
  );
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
