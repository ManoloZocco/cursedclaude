/**
 * Translates Anthropic Messages API requests into Cursor's format.
 *
 * Strategy:
 * - System prompt + tool definitions are merged into a single system instruction
 * - Messages are flattened to simple {role, content} pairs
 * - Tool use/results are converted to text with structured markers
 */

import type { AnthropicRequest, AnthropicContentBlock, AnthropicToolDefinition } from "./types.js";
import type { ChatMessage } from "../cursor/encoder.js";
import { getConfig } from "../config.js";

const MODEL_MAP: Record<string, string> = {
  // Use Cursor Auto routing by default to avoid plan-specific quota failures.
  "claude-3-5-sonnet-20241022": "default",
  "claude-3-5-sonnet-latest": "default",
  "claude-3-7-sonnet-20250219": "default",
  "claude-3-7-sonnet-latest": "default",
  "claude-sonnet-4-20250514": "default",
  "claude-4-opus-20260301": "default",
  "claude-4.6-opus-high-thinking": "default",
  "claude-3-5-haiku-20241022": "default",
  "claude-3-5-haiku-latest": "default",
  // GPT
  "gpt-4o": "gpt-5.2",
  "gpt-4o-mini": "gpt-5-mini",
};

export function mapModelName(anthropicModel: string): string {
  const cfg = getConfig();
  if (cfg.modelOverride) return cfg.modelOverride;
  return MODEL_MAP[anthropicModel] ?? cfg.defaultModel;
}

function formatToolDefinitions(tools: AnthropicToolDefinition[]): string {
  if (tools.length === 0) return "";

  const lines = ["## Available Tools\n"];
  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    if (tool.description) lines.push(tool.description);
    lines.push(`Parameters: ${JSON.stringify(tool.input_schema, null, 2)}`);
    lines.push("");
  }

  lines.push(
    "When you want to use a tool, respond with a JSON block in this exact format:",
    '```json',
    '{"type":"tool_use","id":"toolu_<unique_id>","name":"<tool_name>","input":{...}}',
    '```',
    "",
    "You may include text before or after tool use blocks.",
    "You can call multiple tools in sequence by including multiple JSON blocks.",
  );

  return lines.join("\n");
}

function flattenContentBlocks(blocks: AnthropicContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "tool_use") {
      parts.push(
        `\`\`\`json\n${JSON.stringify({ type: "tool_use", id: block.id, name: block.name, input: block.input })}\n\`\`\``,
      );
    } else if (block.type === "tool_result") {
      const resultContent =
        typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .map((b) => ("text" in b ? b.text : JSON.stringify(b)))
                .join("\n")
            : "";
      parts.push(`[Tool Result for ${block.tool_use_id}]\n${resultContent}`);
    }
  }

  return parts.join("\n");
}

export function translateRequest(req: AnthropicRequest): {
  messages: ChatMessage[];
  model: string;
  systemPrompt: string;
} {
  const systemParts: string[] = [];

  if (req.system) {
    if (typeof req.system === "string") {
      systemParts.push(req.system);
    } else if (Array.isArray(req.system)) {
      systemParts.push(req.system.map((b) => b.text).join("\n"));
    }
  }

  if (req.tools && req.tools.length > 0) {
    systemParts.push(formatToolDefinitions(req.tools));
  }

  const messages: ChatMessage[] = [];

  for (const msg of req.messages) {
    const content =
      typeof msg.content === "string" ? msg.content : flattenContentBlocks(msg.content);

    if (content.trim()) {
      messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content });
    }
  }

  return {
    messages,
    model: mapModelName(req.model),
    systemPrompt: systemParts.join("\n\n"),
  };
}
