// Minimal read-only LevelDB extractor: enough of the .log (write-ahead log)
// and .ldb (sstable) formats to pull key/value pairs out of a Chrome profile
// database. Not a general LevelDB implementation; every parse step is
// defensive because the caller treats "no data" as a safe outcome.

export type Entries = Map<string, Uint8Array>;

function varint32(buf: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (pos < buf.length && shift <= 28) {
    const b = buf[pos]!;
    pos += 1;
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result >>> 0, pos];
    shift += 7;
  }
  throw new Error("bad varint");
}

function varint64(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  while (pos < buf.length && shift <= 63n) {
    const b = buf[pos]!;
    pos += 1;
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
  throw new Error("bad varint64");
}

// Raw snappy block-format decompressor.
export function snappyDecompress(input: Uint8Array): Uint8Array {
  const [rawLen, afterLen] = varint32(input, 0);
  let pos = afterLen;
  const out = new Uint8Array(rawLen);
  let o = 0;
  while (pos < input.length && o < rawLen) {
    const tag = input[pos]!;
    pos += 1;
    const kind = tag & 3;
    if (kind === 0) {
      let len = (tag >> 2) + 1;
      if (len > 60) {
        const extra = len - 60;
        len = 0;
        for (let i = 0; i < extra; i++) len |= input[pos + i]! << (8 * i);
        len += 1;
        pos += extra;
      }
      out.set(input.subarray(pos, pos + len), o);
      pos += len;
      o += len;
    } else {
      let len: number;
      let offset: number;
      if (kind === 1) {
        len = ((tag >> 2) & 0x7) + 4;
        offset = ((tag >> 5) << 8) | input[pos]!;
        pos += 1;
      } else if (kind === 2) {
        len = (tag >> 2) + 1;
        offset = input[pos]! | (input[pos + 1]! << 8);
        pos += 2;
      } else {
        len = (tag >> 2) + 1;
        offset =
          input[pos]! |
          (input[pos + 1]! << 8) |
          (input[pos + 2]! << 16) |
          (input[pos + 3]! << 24);
        pos += 4;
      }
      if (offset <= 0 || offset > o) throw new Error("bad snappy offset");
      for (let i = 0; i < len; i++) {
        out[o] = out[o - offset]!;
        o += 1;
      }
    }
  }
  return out;
}

// --- Write-ahead log (.log) ---

const LOG_BLOCK = 32768;

export function parseLog(file: Uint8Array, into: Entries): void {
  let record: number[] = [];
  for (let block = 0; block < file.length; block += LOG_BLOCK) {
    let pos = block;
    const end = Math.min(block + LOG_BLOCK, file.length);
    while (end - pos >= 7) {
      const length = file[pos + 4]! | (file[pos + 5]! << 8);
      const type = file[pos + 6]!;
      pos += 7;
      if (type === 0 && length === 0) break; // preallocated tail
      const payload = file.subarray(pos, pos + length);
      pos += length;
      if (type === 1) {
        applyBatch(payload, into);
        record = [];
      } else if (type === 2) {
        record = [...payload];
      } else if (type === 3) {
        record.push(...payload);
      } else if (type === 4) {
        record.push(...payload);
        applyBatch(new Uint8Array(record), into);
        record = [];
      }
    }
  }
}

function applyBatch(batch: Uint8Array, into: Entries): void {
  try {
    let pos = 12; // 8-byte sequence + 4-byte count
    const count = new DataView(batch.buffer, batch.byteOffset + 8, 4).getUint32(
      0,
      true,
    );
    for (let i = 0; i < count && pos < batch.length; i++) {
      const type = batch[pos]!;
      pos += 1;
      let keyLen: number;
      [keyLen, pos] = varint32(batch, pos);
      const key = batch.subarray(pos, pos + keyLen);
      pos += keyLen;
      if (type === 1) {
        let valLen: number;
        [valLen, pos] = varint32(batch, pos);
        const value = batch.subarray(pos, pos + valLen);
        pos += valLen;
        into.set(latin1(key), Uint8Array.from(value));
      } else {
        into.delete(latin1(key));
      }
    }
  } catch {
    // Truncated or unrecognized batch: keep whatever parsed so far.
  }
}

// --- SSTable (.ldb) ---

const SST_MAGIC = 0xdb4775248b80fb57n;

interface BlockHandle {
  offset: number;
  size: number;
}

function readHandle(buf: Uint8Array, pos: number): [BlockHandle, number] {
  const [offset, p1] = varint64(buf, pos);
  const [size, p2] = varint64(buf, p1);
  return [{ offset: Number(offset), size: Number(size) }, p2];
}

function readBlock(file: Uint8Array, handle: BlockHandle): Uint8Array {
  const raw = file.subarray(handle.offset, handle.offset + handle.size);
  const type = file[handle.offset + handle.size]!;
  if (type === 1) return snappyDecompress(raw);
  return raw;
}

interface BlockEntry {
  key: Uint8Array;
  value: Uint8Array;
}

function* blockEntries(block: Uint8Array): Generator<BlockEntry> {
  if (block.length < 4) return;
  const numRestarts = new DataView(
    block.buffer,
    block.byteOffset + block.length - 4,
    4,
  ).getUint32(0, true);
  const dataEnd = block.length - 4 - numRestarts * 4;
  let pos = 0;
  let prevKey = new Uint8Array(0);
  while (pos < dataEnd) {
    let shared: number, unshared: number, valueLen: number;
    [shared, pos] = varint32(block, pos);
    [unshared, pos] = varint32(block, pos);
    [valueLen, pos] = varint32(block, pos);
    const key = new Uint8Array(shared + unshared);
    key.set(prevKey.subarray(0, shared), 0);
    key.set(block.subarray(pos, pos + unshared), shared);
    pos += unshared;
    const value = block.subarray(pos, pos + valueLen);
    pos += valueLen;
    prevKey = key;
    yield { key, value: Uint8Array.from(value) };
  }
}

export function parseSstable(file: Uint8Array, into: Entries): void {
  if (file.length < 48) return;
  const footer = file.subarray(file.length - 48);
  const magic = new DataView(
    footer.buffer,
    footer.byteOffset + 40,
    8,
  ).getBigUint64(0, true);
  if (magic !== SST_MAGIC) return;
  const [, afterMeta] = readHandle(footer, 0);
  const [indexHandle] = readHandle(footer, afterMeta);
  const indexBlock = readBlock(file, indexHandle);
  for (const indexEntry of blockEntries(indexBlock)) {
    let dataHandle: BlockHandle;
    try {
      [dataHandle] = readHandle(indexEntry.value, 0);
    } catch {
      continue;
    }
    let dataBlock: Uint8Array;
    try {
      dataBlock = readBlock(file, dataHandle);
    } catch {
      continue;
    }
    for (const entry of blockEntries(dataBlock)) {
      // Internal keys carry an 8-byte (sequence << 8 | type) trailer.
      if (entry.key.length < 8) continue;
      const userKey = entry.key.subarray(0, entry.key.length - 8);
      const type = entry.key[entry.key.length - 8]!;
      if (type === 1) into.set(latin1(userKey), entry.value);
      else into.delete(latin1(userKey));
    }
  }
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

// Read a whole LevelDB directory: sstables in file order (older first), then
// write-ahead logs so the newest writes win.
export async function readLevelDb(
  dir: string,
  readFile: (path: string) => Promise<Uint8Array>,
  listDir: (path: string) => Promise<string[]>,
): Promise<Entries> {
  const entries: Entries = new Map();
  const names = (await listDir(dir)).sort();
  for (const name of names.filter((n) => n.endsWith(".ldb"))) {
    try {
      parseSstable(await readFile(`${dir}/${name}`), entries);
    } catch {
      // Skip unreadable tables; partial data is acceptable.
    }
  }
  for (const name of names.filter((n) => n.endsWith(".log"))) {
    try {
      parseLog(await readFile(`${dir}/${name}`), entries);
    } catch {
      // Same: best effort.
    }
  }
  return entries;
}
