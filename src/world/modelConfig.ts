import type { Nation, World } from "./types";

/** 单个国家使用的第三方大模型配置。 */
export type NationModelConfig = {
  nationId: string;
  enabled: boolean;
  providerName: string;
  endpoint: string;
  model: string;
  apiKey: string;
  personalityPrompt: string;
};

/** 按国家 ID 索引的大模型配置集合。 */
export type NationModelConfigs = Record<string, NationModelConfig>;

/** 连接测试失败的稳定错误类型。 */
export type ModelConnectionErrorCode =
  | "invalid_endpoint"
  | "missing_model"
  | "request_rejected"
  | "request_timeout"
  | "network_error";

const STORAGE_KEY = "ai-civilization:nation-model-configs:v1";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class ModelConnectionError extends Error {
  readonly code: ModelConnectionErrorCode;

  constructor(code: ModelConnectionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelConnectionError";
    this.code = code;
  }
}

/** 为指定国家生成可直接编辑的默认配置。 */
export function buildDefaultNationModelConfig(nation: Nation): NationModelConfig {
  return {
    nationId: nation.id,
    enabled: false,
    providerName: "OpenAI Compatible",
    endpoint: DEFAULT_ENDPOINT,
    model: "",
    apiKey: "",
    personalityPrompt: [
      `You are the national decision maker of ${nation.nameEn}.`,
      "Act consistently with the nation's interests, history, resources, diplomatic situation, and military reality.",
      "Maintain a distinctive personality while returning decisions in the exact structured format requested by the game.",
    ].join(" "),
  };
}

/** 为当前世界建立完整的每国默认配置集合。 */
export function buildDefaultNationModelConfigs(world: World): NationModelConfigs {
  return Object.fromEntries(
    world.nations.map((nation) => [nation.id, buildDefaultNationModelConfig(nation)]),
  );
}

/** 从当前浏览器读取配置，并用默认值补齐新生成的国家和缺失字段。 */
export function loadNationModelConfigs(world: World): NationModelConfigs {
  const defaults = buildDefaultNationModelConfigs(world);
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const stored = parseStoredConfigs(JSON.parse(raw) as unknown);
    return Object.fromEntries(
      world.nations.map((nation) => {
        const fallback = defaults[nation.id];
        const saved = stored[nation.id];
        return [nation.id, saved ? { ...fallback, ...saved, nationId: nation.id } : fallback];
      }),
    );
  } catch (error) {
    console.error("读取国家大模型配置失败，将使用默认配置：", error);
    return defaults;
  }
}

/** 将每个国家的大模型配置保存到当前浏览器。 */
export function saveNationModelConfigs(configs: NationModelConfigs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch (error) {
    console.error("保存国家大模型配置失败：", error);
    throw new Error("无法将国家大模型配置保存到当前浏览器。", { cause: error });
  }
}

/**
 * 使用 OpenAI 兼容的 Chat Completions 请求测试指定配置。
 * 只有调用本方法时才会向配置中的地址发送 API Key 和测试消息。
 */
export async function testNationModelConnection(config: NationModelConfig): Promise<void> {
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
    if (!(["http:", "https:"].includes(endpoint.protocol))) throw new Error("协议不受支持");
  } catch (error) {
    throw new ModelConnectionError("invalid_endpoint", "API 地址无效，请填写完整的 HTTP 或 HTTPS 地址。", { cause: error });
  }
  if (!config.model.trim()) {
    throw new ModelConnectionError("missing_model", "模型名称不能为空。请填写第三方服务提供的模型 ID。");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [
          { role: "system", content: config.personalityPrompt.trim() || "You are a national strategy AI." },
          { role: "user", content: "Connection test. Reply with OK only." },
        ],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    if (!response.ok) {
      throw new ModelConnectionError(
        "request_rejected",
        `第三方模型服务拒绝了请求（HTTP ${response.status}）。`,
      );
    }
  } catch (error) {
    if (error instanceof ModelConnectionError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ModelConnectionError("request_timeout", "连接测试超时，请检查 API 地址和网络状态。");
    }
    throw new ModelConnectionError(
      "network_error",
      "无法连接第三方模型服务。请检查 API 地址、网络状态和服务端跨域设置。",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseStoredConfigs(value: unknown): NationModelConfigs {
  if (!isRecord(value)) return {};
  const result: NationModelConfigs = {};
  for (const [nationId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    result[nationId] = {
      nationId,
      enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : false,
      providerName: readString(candidate.providerName),
      endpoint: readString(candidate.endpoint),
      model: readString(candidate.model),
      apiKey: readString(candidate.apiKey),
      personalityPrompt: readString(candidate.personalityPrompt),
    };
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
