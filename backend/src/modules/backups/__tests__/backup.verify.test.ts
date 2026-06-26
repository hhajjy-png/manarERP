import { describe, it, expect } from 'vitest';
import { backupService } from '../../../shared/services/backup.service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('BackupService.computeChecksum', () => {
  it('returns a 64-char hex string for a known file', () => {
    const tmp = path.join(os.tmpdir(), 'test-checksum.bin');
    fs.writeFileSync(tmp, Buffer.from('hello'));
    const result = backupService.computeChecksum(tmp);
    fs.unlinkSync(tmp);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same content', () => {
    const tmp = path.join(os.tmpdir(), 'test-det.bin');
    fs.writeFileSync(tmp, Buffer.from('manar'));
    const r1 = backupService.computeChecksum(tmp);
    const r2 = backupService.computeChecksum(tmp);
    fs.unlinkSync(tmp);
    expect(r1).toBe(r2);
  });
});

describe('BackupService.verify (missing file)', () => {
  it('returns FAIL when backup filePath does not exist on disk', async () => {
    // Insert a fake DB record pointing to a nonexistent file
    const { prisma } = await import('../../../config/database');
    const fake = await prisma.backup.create({
      data: {
        fileName: 'fake-missing.db',
        filePath: '/nonexistent/path/fake.db',
        sizeBytes: 0,
        type: 'MANUAL',
        status: 'SUCCESS',
      },
    });
    const result = await backupService.verify(fake.id);
    expect(result.status).toBe('FAIL');
    await prisma.backup.delete({ where: { id: fake.id } });
  });
});
