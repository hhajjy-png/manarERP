import { describe, it, expect } from 'vitest';
import {
  snappyDecompress,
  readSSTable,
  readWriteAheadLog,
  decodeStoredValue,
  findLatestValue,
  originOf,
} from '../legacyLevelDb.pure';

/**
 * Legacy Cheque Template Recovery Pack v1 — LevelDB reader suite.
 *
 * This reader exists so cheque templates stranded in a PREVIOUS `userData`
 * folder can be recovered without shipping a native LevelDB binding. Its whole
 * value depends on parsing a real Chromium store correctly, and its whole SAFETY
 * depends on never throwing at anything malformed — a recovery convenience must
 * not be able to take the application down.
 *
 * The fixtures below are built by hand to the documented on-disk formats, so the
 * suite pins the parser rather than one particular file that happened to work.
 */

// ── Fixture builders ─────────────────────────────────────────────────────────

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

/** A raw Snappy stream of pure literals (no back-references). */
function snappyLiteral(payload: Buffer): Buffer {
  const parts: Buffer[] = [varint(payload.length)];
  const n = payload.length - 1;
  if (n < 60) {
    parts.push(Buffer.from([n << 2]));
  } else {
    // 2-byte extended length
    parts.push(Buffer.from([(61 << 2) | 0x00, n & 0xff, (n >> 8) & 0xff]));
  }
  parts.push(payload);
  return Buffer.concat(parts);
}

/** A LevelDB block holding entries with no prefix compression, one restart point. */
function buildBlock(entries: { key: Buffer; value: Buffer }[]): Buffer {
  const body: Buffer[] = [];
  for (const { key, value } of entries) {
    body.push(varint(0), varint(key.length), varint(value.length), key, value);
  }
  const data = Buffer.concat(body);
  const restarts = Buffer.alloc(8);
  restarts.writeUInt32LE(0, 0); // single restart at offset 0
  restarts.writeUInt32LE(1, 4); // restart count
  return Buffer.concat([data, restarts]);
}

/** An internal key: user key + 8-byte tail whose low byte is the record type. */
function internalKey(userKey: Buffer, type: 0 | 1 = 1): Buffer {
  const tail = Buffer.alloc(8);
  tail[0] = type;
  return Buffer.concat([userKey, tail]);
}

/** A stored value with Chromium's UTF-8 encoding prefix. */
function storedUtf8(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x01]), Buffer.from(text, 'utf8')]);
}

/** A stored value with Chromium's UTF-16LE encoding prefix. */
function storedUtf16(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'utf16le')]);
}

/** Assemble a complete SSTable: data block(s), index block, footer. */
function buildSSTable(
  entries: { key: Buffer; value: Buffer }[],
  options: { compressData?: boolean } = {},
): Buffer {
  const dataBlock = buildBlock(entries);
  const dataStored = options.compressData ? snappyLiteral(dataBlock) : dataBlock;
  const dataTrailer = Buffer.from([options.compressData ? 1 : 0, 0, 0, 0, 0]); // type + crc

  const dataOffset = 0;
  const dataSize = dataStored.length;

  const indexEntry = {
    key: Buffer.from('zzz'),
    value: Buffer.concat([varint(dataOffset), varint(dataSize)]),
  };
  const indexBlock = buildBlock([indexEntry]);
  const indexOffset = dataStored.length + 5;
  const indexTrailer = Buffer.from([0, 0, 0, 0, 0]);

  const footerBody = Buffer.concat([
    varint(0), // metaindex offset (unused)
    varint(0), // metaindex size   (unused)
    varint(indexOffset),
    varint(indexBlock.length),
  ]);
  const footer = Buffer.alloc(48);
  footerBody.copy(footer, 0);
  Buffer.from('57fb808b247547db', 'hex').copy(footer, 40);

  return Buffer.concat([dataStored, dataTrailer, indexBlock, indexTrailer, footer]);
}

/** A write-ahead log holding one FULL record with a single-record write batch. */
function buildLog(entries: { key: Buffer; value: Buffer | null }[]): Buffer {
  const records: Buffer[] = [];
  for (const { key, value } of entries) {
    const keyBuf = key;
    records.push(
      value === null
        ? Buffer.concat([Buffer.from([0]), varint(keyBuf.length), keyBuf])
        : Buffer.concat([Buffer.from([1]), varint(keyBuf.length), keyBuf, varint(value.length), value]),
    );
  }
  const batch = Buffer.concat([Buffer.alloc(12), ...records]); // 8-byte seq + 4-byte count
  const header = Buffer.alloc(7);
  header.writeUInt32LE(0, 0); // crc — never verified by this reader
  header.writeUInt16LE(batch.length, 4);
  header[6] = 1; // FULL
  return Buffer.concat([header, batch]);
}

const KEY = 'chequeDesigner.templates.v1';
/**
 * Chromium's LocalStorage key layout: an underscore, the page origin, a NUL
 * separator, an encoding byte, then the script key. Built from explicit bytes so
 * the fixture matches the real on-disk shape rather than an approximation.
 */
function storageKeyBytes(origin: string, key: string): Buffer {
  return Buffer.concat([
    Buffer.from(`_${origin}`, 'latin1'),
    Buffer.from([0x00, 0x01]),
    Buffer.from(key, 'latin1'),
  ]);
}
const STORAGE_KEY_BYTES = storageKeyBytes('http://localhost:5173', KEY);
const PAYLOAD = JSON.stringify({
  version: 1,
  templates: [{ id: 'tpl-1', name: 'قالب', isDefault: true, surface: { widthCm: 17.8, heightCm: 8.9 }, fields: [] }],
});

// ── Snappy ───────────────────────────────────────────────────────────────────

describe('snappy decompression', () => {
  it('round-trips a literal-only stream', () => {
    const payload = Buffer.from('the quick brown fox', 'utf8');
    expect(snappyDecompress(snappyLiteral(payload)).toString()).toBe(payload.toString());
  });

  it('round-trips a payload longer than the 60-byte inline length limit', () => {
    const payload = Buffer.from('x'.repeat(5000), 'utf8');
    expect(snappyDecompress(snappyLiteral(payload)).length).toBe(5000);
  });

  it('expands a back-reference copy, including one that overlaps its own output', () => {
    // literal "ab", then a 1-byte-offset copy of length 4 at offset 2 → "ababab"…
    const stream = Buffer.concat([
      varint(6),
      Buffer.from([1 << 2]), // literal, length 2
      Buffer.from('ab', 'latin1'),
      Buffer.from([0x01 | (0 << 2), 0x02]), // copy: length 4, offset 2
    ]);
    expect(snappyDecompress(stream).toString('latin1')).toBe('ababab');
  });

  it('rejects a copy pointing before the start of the output', () => {
    const stream = Buffer.concat([varint(4), Buffer.from([0x01, 0x09])]);
    expect(() => snappyDecompress(stream)).toThrow();
  });
});

// ── SSTable ──────────────────────────────────────────────────────────────────

describe('SSTable reading', () => {
  it('reads an entry out of an uncompressed data block', () => {
    const table = buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES), value: storedUtf8(PAYLOAD) }]);
    const entries = readSSTable(table);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(PAYLOAD);
  });

  it('reads an entry out of a SNAPPY-COMPRESSED data block — the real-world case', () => {
    const table = buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES), value: storedUtf8(PAYLOAD) }], { compressData: true });
    expect(readSSTable(table)[0].value).toBe(PAYLOAD);
  });

  it('reports a deletion record as a deletion, not as a value', () => {
    const table = buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES, 0), value: storedUtf8(PAYLOAD) }]);
    expect(readSSTable(table)[0].value).toBeNull();
  });

  it('refuses a file that is not an SSTable rather than returning nonsense', () => {
    expect(() => readSSTable(Buffer.alloc(200))).toThrow(/magic/);
    expect(() => readSSTable(Buffer.from('too short'))).toThrow(/too short/);
  });
});

// ── Write-ahead log ──────────────────────────────────────────────────────────

describe('write-ahead log reading', () => {
  it('reads a value written in a FULL record', () => {
    const entries = readWriteAheadLog(buildLog([{ key: STORAGE_KEY_BYTES, value: storedUtf8(PAYLOAD) }]));
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(PAYLOAD);
  });

  it('reads a deletion record', () => {
    const entries = readWriteAheadLog(buildLog([{ key: STORAGE_KEY_BYTES, value: null }]));
    expect(entries[0].value).toBeNull();
  });

  it('treats a truncated tail as end-of-data, not as corruption', () => {
    const log = buildLog([{ key: STORAGE_KEY_BYTES, value: storedUtf8(PAYLOAD) }]);
    expect(() => readWriteAheadLog(log.subarray(0, log.length - 20))).not.toThrow();
  });

  it('returns nothing for random bytes instead of throwing', () => {
    const junk = Buffer.alloc(500);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) % 251;
    expect(() => readWriteAheadLog(junk)).not.toThrow();
  });
});

// ── Value decoding ───────────────────────────────────────────────────────────

describe('Chromium value decoding', () => {
  it('decodes the UTF-16LE encoding prefix — how Arabic template names are stored', () => {
    expect(decodeStoredValue(storedUtf16('قالب الخليج'))).toBe('قالب الخليج');
  });

  it('decodes the UTF-8 encoding prefix', () => {
    expect(decodeStoredValue(storedUtf8('plain'))).toBe('plain');
  });

  it('extracts the page origin for diagnostics', () => {
    expect(originOf(STORAGE_KEY_BYTES)).toBe('http://localhost:5173');
  });
});

// ── Recency resolution across files ──────────────────────────────────────────

describe('resolving the newest value across a store', () => {
  it('prefers a later log write over an earlier SSTable value', () => {
    const older = JSON.stringify({ version: 1, templates: [{ id: 'old' }] });
    const newer = JSON.stringify({ version: 1, templates: [{ id: 'new' }] });
    const found = findLatestValue(
      [
        { name: '000041.ldb', bytes: buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES), value: storedUtf8(older) }]) },
        { name: '000042.log', bytes: buildLog([{ key: STORAGE_KEY_BYTES, value: storedUtf8(newer) }]) },
      ],
      KEY,
    );
    expect(found?.value).toBe(newer);
  });

  it('honours a later DELETION — a store the user cleared stays cleared', () => {
    const found = findLatestValue(
      [
        { name: '000041.ldb', bytes: buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES), value: storedUtf8(PAYLOAD) }]) },
        { name: '000042.log', bytes: buildLog([{ key: STORAGE_KEY_BYTES, value: null }]) },
      ],
      KEY,
    );
    expect(found).toBeNull();
  });

  it('skips an unreadable file and still finds the value in a readable one', () => {
    const found = findLatestValue(
      [
        { name: '000001.ldb', bytes: Buffer.from('total garbage, not an sstable at all') },
        { name: '000042.log', bytes: buildLog([{ key: STORAGE_KEY_BYTES, value: storedUtf8(PAYLOAD) }]) },
      ],
      KEY,
    );
    expect(found?.value).toBe(PAYLOAD);
  });

  it('returns null when the key is simply not there', () => {
    const other = storageKeyBytes('file://', 'manar.theme');
    const found = findLatestValue(
      [{ name: '000042.log', bytes: buildLog([{ key: other, value: storedUtf8('dark') }]) }],
      KEY,
    );
    expect(found).toBeNull();
  });

  it('reports which file and origin the value came from', () => {
    const found = findLatestValue(
      [{ name: '000041.ldb', bytes: buildSSTable([{ key: internalKey(STORAGE_KEY_BYTES), value: storedUtf8(PAYLOAD) }]) }],
      KEY,
    );
    expect(found?.file).toBe('000041.ldb');
    expect(found?.origin).toBe('http://localhost:5173');
  });
});
