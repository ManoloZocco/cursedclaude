/**
 * Encodes requests for Cursor's StreamUnifiedChatWithTools gRPC endpoint.
 * Schema reverse-engineered from cursor_api_demo.
 */

import { randomUUID } from "crypto";
import { platform, arch, release } from "os";
import { encodeField, WIRE_VARINT, WIRE_LENGTH_DELIMITED } from "./protobuf.js";
const F = encodeField;
const V = WIRE_VARINT;
const L = WIRE_LENGTH_DELIMITED;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function encodeMessage(
  content: string,
  role: number,
  messageId: string,
  chatModeEnum?: number,
): Buffer {
  const parts: Buffer[] = [
    F(1, L, content),
    F(2, V, role),
    F(13, L, messageId),
  ];
  if (chatModeEnum !== undefined) {
    parts.push(F(47, V, chatModeEnum));
  }
  return Buffer.concat(parts);
}

function encodeInstruction(text: string): Buffer {
  return F(1, L, text);
}

function encodeModel(name: string): Buffer {
  return Buffer.concat([F(1, L, name), F(4, L, Buffer.alloc(0))]);
}

function encodeCursorSetting(): Buffer {
  const unknown6 = Buffer.concat([
    F(1, L, Buffer.alloc(0)),
    F(2, L, Buffer.alloc(0)),
  ]);

  return Buffer.concat([
    F(1, L, "cursor\\aisettings"),
    F(3, L, Buffer.alloc(0)),
    F(6, L, unknown6),
    F(8, V, 1),
    F(9, V, 1),
  ]);
}

function encodeMetadata(): Buffer {
  return Buffer.concat([
    F(1, L, platform()),
    F(2, L, arch()),
    F(3, L, release()),
    F(4, L, process.argv[0] ?? "node"),
    F(5, L, new Date().toISOString()),
  ]);
}

function encodeMessageId(messageId: string, role: number): Buffer {
  return Buffer.concat([F(1, L, messageId), F(3, V, role)]);
}

function roleToInt(role: string): number {
  switch (role) {
    case "user":
      return 1;
    case "assistant":
      return 2;
    case "system":
      return 3;
    default:
      return 1;
  }
}

function encodeRequest(messages: ChatMessage[], modelName: string, systemPrompt?: string): Buffer {
  const parts: Buffer[] = [];
  const messageIds: { id: string; role: number }[] = [];

  for (const msg of messages) {
    const msgId = randomUUID();
    const roleInt = roleToInt(msg.role);

    const msgBuf = encodeMessage(
      msg.content,
      roleInt,
      msgId,
      msg.role === "user" ? 1 : undefined,
    );
    parts.push(F(1, L, msgBuf));
    messageIds.push({ id: msgId, role: roleInt });
  }

  parts.push(F(2, V, 1));
  parts.push(F(3, L, encodeInstruction(systemPrompt ?? "")));
  parts.push(F(4, V, 1));
  parts.push(F(5, L, encodeModel(modelName)));
  parts.push(F(8, L, ""));
  parts.push(F(13, V, 1));
  parts.push(F(15, L, encodeCursorSetting()));
  parts.push(F(19, V, 1));
  parts.push(F(23, L, randomUUID()));
  parts.push(F(26, L, encodeMetadata()));
  parts.push(F(27, V, 0));

  for (const mid of messageIds) {
    parts.push(F(30, L, encodeMessageId(mid.id, mid.role)));
  }

  parts.push(F(35, V, 0));
  parts.push(F(38, V, 0));
  parts.push(F(46, V, 1));
  parts.push(F(47, L, ""));
  parts.push(F(48, V, 0));
  parts.push(F(49, V, 0));
  parts.push(F(51, V, 0));
  parts.push(F(53, V, 1));
  parts.push(F(54, L, "agent"));

  return Buffer.concat(parts);
}

export function encodeCursorRequestBody(
  messages: ChatMessage[],
  modelName: string,
  systemPrompt?: string,
): Buffer {
  const request = encodeRequest(messages, modelName, systemPrompt);
  const wrapper = F(1, L, request);

  const payload = wrapper;
  const magicByte = 0x00;

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(payload.length, 0);

  return Buffer.concat([Buffer.from([magicByte]), lenBuf, payload]);
}

export type { ChatMessage };
