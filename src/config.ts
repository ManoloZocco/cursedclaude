/**
 * Runtime configuration for CursedClaude.
 */

export interface ProxyConfig {
  port: number;
  defaultModel: string;
  modelOverride: string | null;
  verbose: boolean;
}

let _config: ProxyConfig = {
  port: 8080,
  defaultModel: "default",
  modelOverride: null,
  verbose: false,
};

export function getConfig(): ProxyConfig {
  return _config;
}

export function setConfig(partial: Partial<ProxyConfig>): void {
  _config = { ..._config, ...partial };
}

export const AVAILABLE_CURSOR_MODELS = [
  "claude-4.6-opus-high-thinking",
  "claude-4.6-opus-max-thinking",
  "claude-4.6-sonnet-medium-thinking",
  "claude-4.5-opus-high-thinking",
  "claude-4.5-sonnet-thinking",
  "claude-4.5-sonnet",
  "claude-4.5-haiku-thinking",
  "claude-4.5-haiku",
  "claude-4-sonnet-thinking",
  "claude-4-sonnet",
  "gpt-5.4-high",
  "gpt-5.3-codex-high",
  "gpt-5.2-high",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5-mini",
  "gemini-3.1-pro",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "grok-4-20-thinking",
  "kimi-k2.5",
] as const;
