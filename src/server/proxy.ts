/**
 * HTTP server that exposes an Anthropic Messages-compatible endpoint.
 * Claude Code sends POST /v1/messages here; we translate and forward to Cursor.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import type { CursorAuth } from "../auth/cursor.js";
import { streamCursorChat } from "../cursor/client.js";
import { translateRequest, mapModelName } from "../translate/anthropic-to-cursor.js";
import {
  messageStartEvent,
  contentBlockStartEvent,
  contentBlockDeltaEvent,
  contentBlockStopEvent,
  messageDeltaEvent,
  messageStopEvent,
  type AnthropicRequest,
} from "../translate/types.js";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function runCursorNonStreaming(
  auth: CursorAuth,
  input: { messages: { role: "user" | "assistant" | "system"; content: string }[]; model: string; systemPrompt: string },
): Promise<{ text: string; outputTokens: number; apiError?: string }> {
  let text = "";
  let outputTokenEstimate = 0;
  let apiError: string | undefined;

  await streamCursorChat(auth, {
    messages: input.messages,
    model: input.model,
    systemPrompt: input.systemPrompt,
    onChunk(chunk) {
      if (chunk.type === "text" || chunk.type === "thinking") {
        text += chunk.content;
        outputTokenEstimate += Math.ceil(chunk.content.length / 4);
      } else if (chunk.type === "error") {
        apiError = chunk.content;
      }
    },
  });

  return { text, outputTokens: outputTokenEstimate, apiError };
}

export function createProxyApp(auth: CursorAuth) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", email: auth.email, membership: auth.membershipType }));

  app.post("/v1/messages", async (c) => {
    const body = (await c.req.json()) as AnthropicRequest;
    const isStreaming = body.stream !== false;

    const { messages, model, systemPrompt } = translateRequest(body);
    const requestedModel = mapModelName(body.model);

    if (!isStreaming) {
      try {
        const result = await runCursorNonStreaming(auth, { messages, model, systemPrompt });

        if (result.apiError) {
          // Return Anthropic-style error envelope so client doesn't crash on missing fields.
          return c.json(
            {
              type: "error",
              error: {
                type: "api_error",
                message: result.apiError,
              },
            },
            429,
          );
        }

        return c.json({
          id: `msg_${Date.now()}`,
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: result.text }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: result.outputTokens,
          },
        });
      } catch (err) {
        return c.json(
          {
            type: "error",
            error: { type: "api_error", message: String(err) },
          },
          500,
        );
      }
    }

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-CC-Proxy-Model", requestedModel);

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const write = (s: string) => controller.enqueue(encoder.encode(s));

        let outputTokenEstimate = 0;
        let blockOpen = false;

        write(sseEvent("message_start", messageStartEvent(body.model, 0)));
        write(sseEvent("content_block_start", contentBlockStartEvent(0)));
        blockOpen = true;

        streamCursorChat(auth, {
          messages,
          model,
          systemPrompt,
          onChunk(chunk) {
            if (chunk.type === "text") {
              outputTokenEstimate += Math.ceil(chunk.content.length / 4);
              write(sseEvent("content_block_delta", contentBlockDeltaEvent(0, chunk.content)));
            } else if (chunk.type === "thinking") {
              write(sseEvent("content_block_delta", contentBlockDeltaEvent(0, chunk.content)));
            } else if (chunk.type === "error") {
              write(
                sseEvent("error", { type: "error", error: { type: "api_error", message: chunk.content } }),
              );
            } else if (chunk.type === "end") {
              // handled in .then()
            }
          },
        })
          .then(() => {
            if (blockOpen) {
              write(sseEvent("content_block_stop", contentBlockStopEvent(0)));
            }
            write(sseEvent("message_delta", messageDeltaEvent("end_turn", outputTokenEstimate)));
            write(sseEvent("message_stop", messageStopEvent()));
            controller.close();
          })
          .catch((err) => {
            write(
              sseEvent("error", {
                type: "error",
                error: { type: "api_error", message: String(err) },
              }),
            );
            if (blockOpen) {
              write(sseEvent("content_block_stop", contentBlockStopEvent(0)));
            }
            write(sseEvent("message_delta", messageDeltaEvent("end_turn", outputTokenEstimate)));
            write(sseEvent("message_stop", messageStopEvent()));
            controller.close();
          });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  app.all("*", (c) => {
    return c.json(
      { error: `cclaude: unsupported route ${c.req.method} ${c.req.path}` },
      404,
    );
  });

  return app;
}

export function startServer(auth: CursorAuth, port: number): Promise<Server> {
  const app = createProxyApp(auth);

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
      if (!settled) {
        settled = true;
        resolve(server);
      }
    }) as Server;

    server.once("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
