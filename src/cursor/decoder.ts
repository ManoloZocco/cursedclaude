/**
 * Decodes Cursor's streaming ConnectRPC responses.
 * Frame format: [msg_type:1byte][msg_len:4bytes_big_endian][msg_data:msg_len_bytes]
 *
 * msg_type:
 *   0 = raw protobuf
 *   1 = gzip-compressed protobuf
 *   2 = raw JSON (end-of-stream / error)
 *   3 = gzip-compressed JSON
 */

import { gunzipSync } from "zlib";
import { decodeMessage, getStringField, WIRE_LENGTH_DELIMITED } from "./protobuf.js";
import { getConfig } from "../config.js";

export interface StreamChunk {
  type: "text" | "thinking" | "tool_call" | "error" | "end" | "debug";
  content: string;
}

function extractTextFromProtobuf(data: Buffer): StreamChunk | null {
  try {
    const topFields = decodeMessage(data);

    // StreamUnifiedChatResponseWithTools structure:
    //   field 1 = StreamUnifiedChatResponse (some responses)
    //   field 2 = StreamUnifiedChatResponse (most responses use this)
    // Inside StreamUnifiedChatResponse:
    //   field 1 = text content
    //   field 3 = thinking content

    for (const field of topFields) {
      if (!Buffer.isBuffer(field.value)) continue;

      if (field.fieldNum === 1 || field.fieldNum === 2) {
        try {
          const chatResponse = decodeMessage(field.value);
          const text = getStringField(chatResponse, 1);
          if (text) return { type: "text", content: text };

          const thinking = getStringField(chatResponse, 3);
          if (thinking) return { type: "thinking", content: thinking };
        } catch {
          // not a nested message, might be raw content
        }
      }

      // Client-side tool calls (field 3+)
      if (field.fieldNum >= 3) {
        try {
          const nested = decodeMessage(field.value);
          const txt = getStringField(nested, 1);
          if (txt && txt.length > 0) return { type: "tool_call", content: txt };
        } catch {
          // not a nested message
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export class CursorStreamDecoder {
  private buffer = Buffer.alloc(0);

  feed(data: Buffer): StreamChunk[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const chunks: StreamChunk[] = [];

    while (this.buffer.length >= 5) {
      const msgType = this.buffer[0]!;
      const msgLen = this.buffer.readUInt32BE(1);

      if (this.buffer.length < 5 + msgLen) break;

      const msgData = this.buffer.subarray(5, 5 + msgLen);
      this.buffer = this.buffer.subarray(5 + msgLen);

      if (msgLen === 0) continue;

      const chunk = this.processFrame(msgType, msgData);
      if (chunk) chunks.push(chunk);
    }

    return chunks;
  }

  private processFrame(msgType: number, data: Buffer): StreamChunk | null {
    const verbose = getConfig().verbose;

    try {
      if (msgType === 0) {
        if (verbose) {
          console.log(`[decoder] Frame type=0 (raw proto) len=${data.length}`);
          this.debugProtobuf(data);
        }
        return extractTextFromProtobuf(data);
      }

      if (msgType === 1) {
        const decompressed = gunzipSync(data);
        if (verbose) {
          console.log(`[decoder] Frame type=1 (gzip proto) len=${data.length} → ${decompressed.length}`);
          this.debugProtobuf(decompressed);
        }
        return extractTextFromProtobuf(decompressed);
      }

      if (msgType === 2 || msgType === 3) {
        const raw = msgType === 3 ? gunzipSync(data) : data;
        if (verbose) console.log(`[decoder] Frame type=${msgType} (json): ${raw.toString("utf-8").slice(0, 200)}`);

        if (raw.length <= 2) return { type: "end", content: "" };

        const text = raw.toString("utf-8");
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) return { type: "error", content: JSON.stringify(parsed) };
        } catch {
          // not JSON
        }
        return { type: "end", content: text };
      }

      if (verbose) console.log(`[decoder] Unknown frame type=${msgType} len=${data.length}`);
      return null;
    } catch (e) {
      if (verbose) console.log(`[decoder] Frame error: ${e}`);
      return null;
    }
  }

  private debugProtobuf(data: Buffer): void {
    try {
      const fields = decodeMessage(data);
      for (const f of fields) {
        if (Buffer.isBuffer(f.value)) {
          const preview = f.value.toString("utf-8").slice(0, 120);
          const printable = /^[\x20-\x7E\n\r\t]+$/.test(preview);
          console.log(`  field=${f.fieldNum} wire=${f.wireType} len=${f.value.length} ${printable ? `"${preview}"` : `(binary ${f.value.slice(0, 16).toString("hex")}...)`}`);
        } else {
          console.log(`  field=${f.fieldNum} wire=${f.wireType} val=${f.value}`);
        }
      }
    } catch (e) {
      console.log(`  (decode error: ${e})`);
    }
  }
}
