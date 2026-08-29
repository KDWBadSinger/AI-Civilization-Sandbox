import { useMemo, useState } from "react";
import {
  buildDefaultNationModelConfig,
  loadNationModelConfigs,
  ModelConnectionError,
  saveNationModelConfigs,
  testNationModelConnection,
  type ModelConnectionErrorCode,
  type NationModelConfig,
  type NationModelConfigs,
} from "../world/modelConfig";
import { getLocalizedName, type Language } from "../world/localization";
import type { World } from "../world/types";

type ConnectionState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success" }
  | { kind: "error"; code: ModelConnectionErrorCode | "unknown" };

type NationModelConfigurationProps = {
  language: Language;
  onBack: () => void;
  world: World;
};

/** 渲染每个国家独立的第三方大模型与国家性格配置页面。 */
export function NationModelConfiguration({
  language,
  onBack,
  world,
}: NationModelConfigurationProps) {
  const [configs, setConfigs] = useState<NationModelConfigs>(() => loadNationModelConfigs(world));
  const [selectedNationId, setSelectedNationId] = useState(world.nations[0]?.id ?? "");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [connectionState, setConnectionState] = useState<ConnectionState>({ kind: "idle" });
  const selectedNation = useMemo(
    () => world.nationById.get(selectedNationId),
    [selectedNationId, world.nationById],
  );
  const selectedConfig = configs[selectedNationId];

  const updateSelectedConfig = <Key extends keyof NationModelConfig>(
    key: Key,
    value: NationModelConfig[Key],
  ) => {
    setConfigs((current) => ({
      ...current,
      [selectedNationId]: { ...current[selectedNationId], [key]: value },
    }));
    setIsDirty(true);
    setSaveState("idle");
    setConnectionState({ kind: "idle" });
  };

  const handleSelectNation = (nationId: string) => {
    setSelectedNationId(nationId);
    setIsKeyVisible(false);
    setConnectionState({ kind: "idle" });
  };

  const handleSave = () => {
    try {
      saveNationModelConfigs(configs);
      setIsDirty(false);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const handleRestore = () => {
    if (!selectedNation) return;
    setConfigs((current) => ({
      ...current,
      [selectedNation.id]: buildDefaultNationModelConfig(selectedNation),
    }));
    setIsDirty(true);
    setSaveState("idle");
    setConnectionState({ kind: "idle" });
  };

  const handleTestConnection = async () => {
    if (!selectedConfig || connectionState.kind === "testing") return;
    setConnectionState({ kind: "testing" });
    try {
      await testNationModelConnection(selectedConfig);
      setConnectionState({ kind: "success" });
    } catch (error) {
      setConnectionState({
        kind: "error",
        code: error instanceof ModelConnectionError ? error.code : "unknown",
      });
    }
  };

  if (!selectedNation || !selectedConfig) {
    return (
      <div className="modelConfigEmpty">
        <h1>No Nations Available</h1>
        <button className="secondaryControl" onClick={onBack} type="button">Back to World</button>
      </div>
    );
  }

  return (
    <div className="modelConfigPage">
      <header className="modelConfigTopbar">
        <div>
          <p className="eyebrow">AI Civilization Sandbox</p>
          <h1>Nation AI Configuration</h1>
          <p>Configure an OpenAI-compatible model and a distinct national personality for every nation.</p>
        </div>
        <div className="modelConfigTopbarActions">
          {isDirty && <span className="unsavedBadge">Unsaved changes</span>}
          <button className="secondaryControl" onClick={onBack} type="button">Back to World</button>
        </div>
      </header>

      <div className="modelConfigWorkspace">
        <nav className="modelConfigNationNav" aria-label="Nations">
          <div className="modelConfigNationNavTitle">
            <span>Nations</span>
            <strong>{world.nations.length}</strong>
          </div>
          <div className="modelConfigNationList">
            {world.nations.map((nation) => {
              const config = configs[nation.id];
              return (
                <button
                  className={selectedNationId === nation.id ? "active" : ""}
                  key={nation.id}
                  onClick={() => handleSelectNation(nation.id)}
                  type="button"
                >
                  <span className="nationColor" style={{ backgroundColor: nation.color }} />
                  <span>
                    <strong>{getLocalizedName(nation, language)}</strong>
                    <small>{config?.enabled ? "External model enabled" : "Simulation AI"}</small>
                  </span>
                  <i className={config?.enabled ? "enabled" : ""} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </nav>

        <section className="modelConfigEditor">
          <div className="modelConfigNationHeader">
            <span style={{ backgroundColor: selectedNation.color }} />
            <div>
              <p>Selected Nation</p>
              <h2>{getLocalizedName(selectedNation, language)}</h2>
            </div>
            <label className="modelEnabledControl">
              <input
                checked={selectedConfig.enabled}
                onChange={(event) => updateSelectedConfig("enabled", event.target.checked)}
                type="checkbox"
              />
              <span>Enable External Model</span>
            </label>
          </div>

          <div className="modelConfigNotice">
            <strong>Browser-only configuration</strong>
            <p>API Keys are stored in this browser. Do not enter production credentials on a shared device.</p>
          </div>

          <div className="modelConfigForm">
            <label>
              <span>Provider Name</span>
              <input
                onChange={(event) => updateSelectedConfig("providerName", event.target.value)}
                placeholder="Example: OpenRouter, DeepSeek, Ollama"
                type="text"
                value={selectedConfig.providerName}
              />
            </label>
            <label>
              <span>API Endpoint</span>
              <input
                onChange={(event) => updateSelectedConfig("endpoint", event.target.value)}
                placeholder="https://provider.example/v1/chat/completions"
                spellCheck={false}
                type="url"
                value={selectedConfig.endpoint}
              />
              <small>Enter the complete OpenAI-compatible Chat Completions endpoint.</small>
            </label>
            <label>
              <span>Model Name</span>
              <input
                onChange={(event) => updateSelectedConfig("model", event.target.value)}
                placeholder="Example: provider/model-name"
                spellCheck={false}
                type="text"
                value={selectedConfig.model}
              />
            </label>
            <label>
              <span>API Key</span>
              <div className="apiKeyInput">
                <input
                  autoComplete="off"
                  onChange={(event) => updateSelectedConfig("apiKey", event.target.value)}
                  placeholder="Optional for local services"
                  spellCheck={false}
                  type={isKeyVisible ? "text" : "password"}
                  value={selectedConfig.apiKey}
                />
                <button onClick={() => setIsKeyVisible((visible) => !visible)} type="button">
                  {isKeyVisible ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <label className="personalityField">
              <span>Nation Personality Prompt</span>
              <textarea
                onChange={(event) => updateSelectedConfig("personalityPrompt", event.target.value)}
                placeholder="Describe this nation's values, ambitions, temperament, and strategic style."
                rows={9}
                value={selectedConfig.personalityPrompt}
              />
              <small>This prompt is sent as the system message before the game's structured decision request.</small>
            </label>
          </div>

          <div className="modelConfigFooter">
            <div className="modelConfigStatus" aria-live="polite">
              {connectionState.kind === "testing" && <span>Testing connection...</span>}
              {connectionState.kind === "success" && <span className="success">Connection successful.</span>}
              {connectionState.kind === "error" && <span className="error">{connectionErrorLabel(connectionState.code)}</span>}
              {saveState === "saved" && <span className="success">Configuration saved locally.</span>}
              {saveState === "error" && <span className="error">Unable to save configuration in this browser.</span>}
            </div>
            <div className="modelConfigActions">
              <button className="ghostControl" onClick={handleRestore} type="button">Restore Nation Defaults</button>
              <button
                className="secondaryControl"
                disabled={connectionState.kind === "testing"}
                onClick={() => void handleTestConnection()}
                type="button"
              >
                {connectionState.kind === "testing" ? "Testing..." : "Test Connection"}
              </button>
              <button className="primaryControl" onClick={handleSave} type="button">Save Configuration</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function connectionErrorLabel(code: ModelConnectionErrorCode | "unknown"): string {
  const labels: Record<ModelConnectionErrorCode | "unknown", string> = {
    invalid_endpoint: "Enter a valid HTTP or HTTPS API endpoint.",
    missing_model: "Enter a model name before testing the connection.",
    request_rejected: "The model service rejected the request. Check the model name and API Key.",
    request_timeout: "Connection timed out. Check the API endpoint and network.",
    network_error: "Unable to reach the model service. Check the endpoint, network, and CORS settings.",
    unknown: "Connection test failed unexpectedly.",
  };
  return labels[code];
}
