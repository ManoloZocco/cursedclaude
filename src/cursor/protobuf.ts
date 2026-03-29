/**
 * Manual protobuf encoding/decoding for Cursor's ConnectRPC API.
 * Translated from eisbaw/cursor_api_demo's Python implementation.
 */

export function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

export function decodeVarint(data: Buffer, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (pos < data.length) {
    const b = data[pos]!;
    result |= (b & 0x7f) << shift;
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return [result >>> 0, pos];
}

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_FIXED32 = 5;

export function encodeField(fieldNum: number, wireType: number, value: unknown): Buffer {
  const tag = encodeVarint((fieldNum << 3) | wireType);

  if (wireType === WIRE_VARINT) {
    return Buffer.concat([tag, encodeVarint(value as number)]);
  }

  if (wireType === WIRE_LENGTH_DELIMITED) {
    let buf: Buffer;
    if (typeof value === "string") {
      buf = Buffer.from(value, "utf-8");
    } else if (Buffer.isBuffer(value)) {
      buf = value;
    } else if (value instanceof Uint8Array) {
      buf = Buffer.from(value);
    } else {
      buf = Buffer.alloc(0);
    }
    return Buffer.concat([tag, encodeVarint(buf.length), buf]);
  }

  throw new Error(`Unsupported wire type: ${wireType}`);
}

export interface DecodedField {
  fieldNum: number;
  wireType: number;
  value: number | Buffer;
}

export function decodeMessage(data: Buffer): DecodedField[] {
  const fields: DecodedField[] = [];
  let pos = 0;

  while (pos < data.length) {
    const [tagValue, newPos] = decodeVarint(data, pos);
    pos = newPos;
    const fieldNum = tagValue >>> 3;
    const wireType = tagValue & 0x07;

    if (wireType === WIRE_VARINT) {
      const [val, p] = decodeVarint(data, pos);
      fields.push({ fieldNum, wireType, value: val });
      pos = p;
    } else if (wireType === WIRE_LENGTH_DELIMITED) {
      const [len, p] = decodeVarint(data, pos);
      fields.push({ fieldNum, wireType, value: data.subarray(p, p + len) });
      pos = p + len;
    } else if (wireType === WIRE_FIXED64) {
      fields.push({ fieldNum, wireType, value: data.subarray(pos, pos + 8) });
      pos += 8;
    } else if (wireType === WIRE_FIXED32) {
      fields.push({ fieldNum, wireType, value: data.subarray(pos, pos + 4) });
      pos += 4;
    } else {
      break;
    }
  }

  return fields;
}

export function getStringField(fields: DecodedField[], num: number): string | null {
  const f = fields.find((f) => f.fieldNum === num && f.wireType === WIRE_LENGTH_DELIMITED);
  return f && Buffer.isBuffer(f.value) ? f.value.toString("utf-8") : null;
}

export function getIntField(fields: DecodedField[], num: number): number | null {
  const f = fields.find((f) => f.fieldNum === num && f.wireType === WIRE_VARINT);
  return f && typeof f.value === "number" ? f.value : null;
}

export function getBytesField(fields: DecodedField[], num: number): Buffer | null {
  const f = fields.find((f) => f.fieldNum === num && f.wireType === WIRE_LENGTH_DELIMITED);
  return f && Buffer.isBuffer(f.value) ? f.value : null;
}
