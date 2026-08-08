/**
 * Minimal, READ-ONLY LevelDB reader for Chromium `Local Storage` stores
 * (Legacy Cheque Template Recovery Pack v1).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Cheque designer templates created before the move to SQLite live in a
 * Chromium `localStorage` LevelDB inside an OLD `userData` folder — a folder
 * the current application never opens, because Chromium partitions
 * `localStorage` by `userData` path AND page origin. Recovering them means
 * reading that LevelDB directly.
 *
 * WHY A HAND-WRITTEN READER RATHER THAN A DEPENDENCY
 * ──────────────────────────────────────────────────
 * The obvious candidates (`classic-level`, `leveldown`) are NATIVE modules:
 * they would have to be rebuilt against every Electron ABI and shipped in the
 * installer, adding a packaging failure mode to an app whose installer was only
 * just stabilised — all to read a few kilobytes, once, ever. The on-disk format
 * is small, frozen and fully specified, so this module implements exactly the
 * parts needed to read it and nothing else.
 *
 * SAFETY
 * ──────
 * Every function here is pure and read-only: it takes bytes and returns values.
 * It never opens a database, never takes the LevelDB `LOCK`, never writes, and
 * never deletes. A malformed or truncated file yields fewer entries — never an
 * exception that could escape and take the application down with it.
 *
 * FORMATS IMPLEMENTED
 *   - Snappy raw block decompression (LevelDB's default block compression)
 *   - SSTable (`*.ldb`): footer → index block → data blocks → entries
 *   - Write-ahead log (`*.log`): fragmented records → write batches → entries
 *   - Chromium LocalStorage encoding: `_<origin>\0\1<key>` and the value's
 *     one-byte UTF-16LE / UTF-8 encoding prefix
 */

/** A single recovered `localStorage` entry. `value` is null for a deletion record. */
export interface LocalStorageEntry {
  /** Raw key bytes, e.g. `_http://localhost:5173\0\1chequeDesigner.templates.v1`. */
  key: Buffer;
  value: string | null;
}

const SSTABLE_MAGIC = '57fb808b247547db';
const LOG_BLOCK_SIZE = 32768;
const FOOTER_SIZE = 48;

/** Read a base-128 varint. Returns the value and the offset just past it. */
function readVarint(buf: Buffer, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    if (offset >= buf.length) throw new Error('varint runs past end of buffer');
    byte = buf[offset++];
    // Multiplication rather than `<<`: shifts beyond 31 bits wrap in JS and
    // would silently corrupt long keys or values.
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if (shift > 63) throw new Error('varint too long');
  } while (byte & 0x80);
  return [result, offset];
}

/**
 * Decompress a raw Snappy block (no framing header — LevelDB stores raw blocks).
 *
 * Format: a varint uncompressed length, then a stream of tagged elements —
 * literals, and copies with 1-, 2- or 4-byte back-offsets. Copies may overlap
 * their own output, so the byte-by-byte copy loop is required, not an oversight.
 */
export function snappyDecompress(src: Buffer): Buffer {
  const [length, start] = readVarint(src, 0);
  if (length > 64 * 1024 * 1024) throw new Error('snappy block implausibly large');
  const out = Buffer.alloc(length);
  let p = start;
  let o = 0;

  while (p < src.length) {
    const tag = src[p];
    const type = tag & 0x03;

    if (type === 0) {
      let n = tag >> 2;
      p += 1;
      if (n >= 60) {
        const extraBytes = n - 59;
        n = 0;
        for (let i = 0; i < extraBytes; i++) n |= src[p + i] << (8 * i);
        p += extraBytes;
      }
      const count = n + 1;
      if (o + count > out.length || p + count > src.length) throw new Error('snappy literal overruns');
      src.copy(out, o, p, p + count);
      o += count;
      p += count;
      continue;
    }

    let copyLength: number;
    let copyOffset: number;
    if (type === 1) {
      copyLength = 4 + ((tag >> 2) & 0x07);
      copyOffset = ((tag >> 5) << 8) | src[p + 1];
      p += 2;
    } else if (type === 2) {
      copyLength = (tag >> 2) + 1;
      copyOffset = src.readUInt16LE(p + 1);
      p += 3;
    } else {
      copyLength = (tag >> 2) + 1;
      copyOffset = src.readUInt32LE(p + 1);
      p += 5;
    }

    if (copyOffset <= 0 || copyOffset > o) throw new Error('snappy copy offset out of range');
    if (o + copyLength > out.length) throw new Error('snappy copy overruns');
    let from = o - copyOffset;
    for (let i = 0; i < copyLength; i++) out[o++] = out[from++];
  }

  return out.subarray(0, o);
}

/**
 * Walk one LevelDB block. Entries are prefix-compressed against the previous
 * key, which is why the previous key must be carried across iterations.
 */
function forEachBlockEntry(block: Buffer, visit: (key: Buffer, value: Buffer) => void): void {
  if (block.length < 4) return;
  const restartCount = block.readUInt32LE(block.length - 4);
  const entriesEnd = block.length - 4 * (restartCount + 1);
  if (entriesEnd < 0) return;

  let p = 0;
  let previousKey = Buffer.alloc(0);
  while (p < entriesEnd) {
    let shared: number;
    let nonShared: number;
    let valueLength: number;
    [shared, p] = readVarint(block, p);
    [nonShared, p] = readVarint(block, p);
    [valueLength, p] = readVarint(block, p);
    if (shared > previousKey.length) throw new Error('block entry shares more bytes than the previous key holds');

    const keyDelta = block.subarray(p, p + nonShared);
    p += nonShared;
    const key = Buffer.concat([previousKey.subarray(0, shared), keyDelta]);
    previousKey = key;

    const value = block.subarray(p, p + valueLength);
    p += valueLength;
    visit(key, value);
  }
}

function readMaybeCompressedBlock(file: Buffer, offset: number, size: number): Buffer {
  const raw = file.subarray(offset, offset + size);
  const compression = file[offset + size];
  return compression === 1 ? snappyDecompress(raw) : raw;
}

/**
 * Read every live entry from an SSTable (`*.ldb`).
 *
 * Data-block keys are INTERNAL keys: the user key followed by an 8-byte
 * sequence/type tail. The low byte of that tail is the record type — 1 for a
 * value, 0 for a deletion. Deletions matter: a key deleted after it was written
 * must not be recovered as if it still existed.
 */
export function readSSTable(file: Buffer): LocalStorageEntry[] {
  if (file.length < FOOTER_SIZE) throw new Error('file is too short to be an SSTable');
  const footer = file.subarray(file.length - FOOTER_SIZE);
  if (footer.subarray(40).toString('hex') !== SSTABLE_MAGIC) throw new Error('not an SSTable (bad magic)');

  let p = 0;
  let indexOffset: number;
  let indexSize: number;
  [, p] = readVarint(footer, p); // metaindex offset — unused
  [, p] = readVarint(footer, p); // metaindex size   — unused
  [indexOffset, p] = readVarint(footer, p);
  [indexSize, p] = readVarint(footer, p);

  const handles: [number, number][] = [];
  forEachBlockEntry(readMaybeCompressedBlock(file, indexOffset, indexSize), (_key, value) => {
    const [blockOffset, next] = readVarint(value, 0);
    const [blockSize] = readVarint(value, next);
    handles.push([blockOffset, blockSize]);
  });

  const entries: LocalStorageEntry[] = [];
  for (const [blockOffset, blockSize] of handles) {
    // One unreadable data block must not discard the blocks that are readable.
    try {
      forEachBlockEntry(readMaybeCompressedBlock(file, blockOffset, blockSize), (internalKey, value) => {
        if (internalKey.length < 8) return;
        const userKey = internalKey.subarray(0, internalKey.length - 8);
        const recordType = internalKey[internalKey.length - 8];
        entries.push({ key: userKey, value: recordType === 1 ? decodeStoredValue(value) : null });
      });
    } catch {
      /* skip the damaged block, keep the rest */
    }
  }
  return entries;
}

/**
 * Read every entry from a write-ahead log (`*.log`).
 *
 * Records are laid out in 32 KiB blocks and may be fragmented across them
 * (FIRST / MIDDLE / LAST). A log is written continuously and is routinely
 * truncated mid-record at the tail, so a short read at the end is normal and is
 * treated as end-of-data rather than as corruption.
 */
export function readWriteAheadLog(file: Buffer): LocalStorageEntry[] {
  const entries: LocalStorageEntry[] = [];
  let pending: Buffer[] = [];
  let pos = 0;

  while (pos + 7 <= file.length) {
    const offsetInBlock = pos % LOG_BLOCK_SIZE;
    if (LOG_BLOCK_SIZE - offsetInBlock < 7) {
      pos += LOG_BLOCK_SIZE - offsetInBlock; // block trailer padding
      continue;
    }
    const length = file.readUInt16LE(pos + 4);
    const recordType = file[pos + 6];
    const payload = file.subarray(pos + 7, pos + 7 + length);
    if (pos + 7 + length > file.length) break; // truncated tail
    pos += 7 + length;

    switch (recordType) {
      case 1: // FULL
        appendBatchEntries(Buffer.from(payload), entries);
        break;
      case 2: // FIRST
        pending = [Buffer.from(payload)];
        break;
      case 3: // MIDDLE
        pending.push(Buffer.from(payload));
        break;
      case 4: // LAST
        pending.push(Buffer.from(payload));
        appendBatchEntries(Buffer.concat(pending), entries);
        pending = [];
        break;
      default: // ZERO / padding
        break;
    }
  }
  return entries;
}

/** Decode one WriteBatch: an 8-byte sequence, a 4-byte count, then tagged records. */
function appendBatchEntries(batch: Buffer, entries: LocalStorageEntry[]): void {
  if (batch.length < 12) return;
  let p = 12;
  try {
    while (p < batch.length) {
      const tag = batch[p++];
      if (tag === 1) {
        let keyLength: number;
        let valueLength: number;
        [keyLength, p] = readVarint(batch, p);
        const key = Buffer.from(batch.subarray(p, p + keyLength));
        p += keyLength;
        [valueLength, p] = readVarint(batch, p);
        const value = batch.subarray(p, p + valueLength);
        p += valueLength;
        entries.push({ key, value: decodeStoredValue(value) });
      } else if (tag === 0) {
        let keyLength: number;
        [keyLength, p] = readVarint(batch, p);
        const key = Buffer.from(batch.subarray(p, p + keyLength));
        p += keyLength;
        entries.push({ key, value: null });
      } else {
        return; // unknown tag — stop rather than guess
      }
    }
  } catch {
    /* truncated batch tail — keep whatever parsed cleanly */
  }
}

/**
 * Chromium prefixes each stored value with its encoding: `0x00` = UTF-16LE,
 * `0x01` = UTF-8/Latin-1. Anything else is read as UTF-8, which is the correct
 * reading for the metadata rows this recovery ignores anyway.
 */
export function decodeStoredValue(value: Buffer): string {
  if (value.length === 0) return '';
  if (value[0] === 0x00) return Buffer.from(value.subarray(1)).toString('utf16le');
  if (value[0] === 0x01) return Buffer.from(value.subarray(1)).toString('utf8');
  return Buffer.from(value).toString('utf8');
}

/**
 * Find the newest live value stored under `storageKey` across a whole LevelDB
 * directory's worth of files.
 *
 * The caller passes files in LevelDB's own recency order — SSTables first, then
 * write-ahead logs, which hold the most recent writes not yet compacted. The
 * LAST entry seen therefore wins, and an explicit deletion wins over an earlier
 * value: a template store the user cleared must not come back from the dead.
 */
export function findLatestValue(
  files: { name: string; bytes: Buffer }[],
  storageKey: string,
): { value: string; origin: string; file: string } | null {
  const needle = Buffer.from(storageKey, 'latin1');
  let found: { value: string; origin: string; file: string } | null = null;

  for (const file of files) {
    let entries: LocalStorageEntry[];
    try {
      entries = file.name.endsWith('.ldb') ? readSSTable(file.bytes) : readWriteAheadLog(file.bytes);
    } catch {
      continue; // unreadable file — try the next one
    }
    for (const entry of entries) {
      if (!entry.key.includes(needle)) continue;
      found = entry.value === null ? null : { value: entry.value, origin: originOf(entry.key), file: file.name };
    }
  }
  return found;
}

/**
 * Extract the page origin from a Chromium LocalStorage key, whose layout is
 * an underscore, the origin, a NUL separator, an encoding byte, then the key.
 *
 * Reported for DIAGNOSTICS ONLY. Recovery never filters on the origin: the
 * origin changing (dev http://localhost:5173 vs packaged file://) is one of the
 * two things that hid these templates in the first place, so filtering on it
 * would reintroduce the very bug being repaired.
 */
export function originOf(key: Buffer): string {
  const separator = key.indexOf(0x00);
  const end = separator === -1 ? key.length : separator;
  const start = key[0] === 0x5f /* underscore */ ? 1 : 0;
  return key.subarray(start, end).toString('latin1');
}
