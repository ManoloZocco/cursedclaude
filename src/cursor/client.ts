/**
 * HTTP/2 client for Cursor's ConnectRPC API at api2.cursor.sh.
 */

import http2 from "http2";
import { randomUUID } from "crypto";
import { platform, arch } from "os";
import {
  CursorAuth,
  generateSessionId,
  generateClientKey,
  generateCursorChecksum,
} from "../auth/cursor.js";
import { encodeCursorRequestBody, type ChatMessage } from "./encoder.js";
import { CursorStreamDecoder, type StreamChunk } from "./decoder.js";

const CURSOR_BASE = "https://api2.cursor.sh";
const CURSOR_VERSION = "2.3.41";

interface CursorRequestOptions {
  messages: ChatMessage[];
  model: string;
  systemPrompt?: string;
  onChunk: (chunk: StreamChunk) => void;
  signal?: AbortSignal;
}

function buildHeaders(auth: CursorAuth): Record<string, string> {
  const token = auth.accessToken.includes("::")
    ? auth.accessToken.split("::")[1]!
    : auth.accessToken;

  const sessionId = generateSessionId(token);
  const clientKey = generateClientKey(token);
  const checksum = generateCursorChecksum(token, auth.machineId);

  return {
    authorization: `Bearer ${token}`,
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "content-type": "application/connect+proto",
    "user-agent": "connect-es/1.6.1",
    "x-amzn-trace-id": `Root=${randomUUID()}`,
    "x-client-key": clientKey,
    "x-cursor-checksum": checksum,
    "x-cursor-client-version": CURSOR_VERSION,
    "x-cursor-client-type": "ide",
    "x-cursor-client-os": platform(),
    "x-cursor-client-arch": arch(),
    "x-cursor-client-device-type": "desktop",
    "x-cursor-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    "x-ghost-mode": "true",
    "x-request-id": randomUUID(),
    "x-session-id": sessionId,
  };
}

export async function streamCursorChat(
  auth: CursorAuth,
  options: CursorRequestOptions,
): Promise<void> {
  const { messages, model, systemPrompt, onChunk, signal } = options;

  const body = encodeCursorRequestBody(messages, model, systemPrompt);
  const headers = buildHeaders(auth);

  return new Promise<void>((resolve, reject) => {
    const session = http2.connect(CURSOR_BASE);
    const decoder = new CursorStreamDecoder();

    if (signal) {
      signal.addEventListener("abort", () => {
        stream.close();
        session.close();
        reject(new Error("Aborted"));
      });
    }

    session.on("error", (err) => {
      reject(err);
    });

    const stream = session.request({
      ":method": "POST",
      ":path": "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
      ...headers,
    });

    stream.write(body);
    stream.end();

    let statusCode: number | undefined;

    stream.on("response", (hdrs) => {
      statusCode = hdrs[":status"];
      if (statusCode !== 200) {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          const errBody = Buffer.concat(chunks).toString("utf-8");
          session.close();
          reject(new Error(`Cursor API returned ${statusCode}: ${errBody.slice(0, 500)}`));
        });
      }
    });

    if (statusCode && statusCode !== 200) return;

    stream.on("data", (data: Buffer) => {
      const chunks = decoder.feed(data);
      for (const chunk of chunks) {
        onChunk(chunk);
      }
    });

    stream.on("end", () => {
      session.close();
      onChunk({ type: "end", content: "" });
      resolve();
    });

    stream.on("error", (err) => {
      session.close();
      reject(err);
    });
  });
}
