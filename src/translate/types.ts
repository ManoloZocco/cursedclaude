/**
 * Anthropic Messages API types used by Claude Code.
 */

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: string; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[] };

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: "text"; text: string }>;
  tools?: AnthropicToolDefinition[];
  max_tokens: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  metadata?: Record<string, unknown>;
}

// SSE event types that Claude Code expects
export interface AnthropicStreamEvent {
  type: string;
  [key: string]: unknown;
}

export function messageStartEvent(model: string, inputTokens: number): AnthropicStreamEvent {
  return {
    type: "message_start",
    message: {
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  };
}

export function contentBlockStartEvent(index: number): AnthropicStreamEvent {
  return {
    type: "content_block_start",
    index,
    content_block: { type: "text", text: "" },
  };
}

export function contentBlockDeltaEvent(index: number, text: string): AnthropicStreamEvent {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text },
  };
}

export function contentBlockStopEvent(index: number): AnthropicStreamEvent {
  return { type: "content_block_stop", index };
}

export function messageDeltaEvent(
  stopReason: string,
  outputTokens: number,
): AnthropicStreamEvent {
  return {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  };
}

export function messageStopEvent(): AnthropicStreamEvent {
  return { type: "message_stop" };
}

export function toolUseStartEvent(
  index: number,
  id: string,
  name: string,
): AnthropicStreamEvent {
  return {
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name },
  };
}

export function toolUseInputDeltaEvent(
  index: number,
  partialJson: string,
): AnthropicStreamEvent {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: partialJson },
  };
}
