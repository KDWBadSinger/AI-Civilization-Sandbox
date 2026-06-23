import { WorldMap } from "./components/WorldMap";
import { buildDemoWorld } from "./world/buildDemoWorld";

const world = buildDemoWorld();

export default function App() {
  return (
    <main className="appShell">
      <section className="mapArea" aria-label="World map">
        <WorldMap world={world} />
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
        <section className="legend">
          <h2>Layers</h2>
          <p><span className="line dashed" /> Province border</p>
          <p><span className="line solid" /> Nation border</p>
          <p><span className="resourceMark" /> Resource node</p>
        </section>
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
