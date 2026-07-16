import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(), unlinkSync: vi.fn() },
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../attachments.service', () => ({
  attachmentsService: {
    assertReadPermission:  vi.fn(),
    assertWritePermission: vi.fn(),
    findEntityType:        vi.fn(),
    list:                  vi.fn(),
    create:                vi.fn(),
    remove:                vi.fn(),
  },
}));

import fs from 'fs';
import { attachmentsController } from '../attachments.controller';
import { attachmentsService } from '../attachments.service';

const mockFs = fs as unknown as { existsSync: ReturnType<typeof vi.fn>; unlinkSync: ReturnType<typeof vi.fn> };
const mockService = attachmentsService as unknown as {
  assertReadPermission:  ReturnType<typeof vi.fn>;
  assertWritePermission: ReturnType<typeof vi.fn>;
  findEntityType:        ReturnType<typeof vi.fn>;
  list:                  ReturnType<typeof vi.fn>;
  create:                ReturnType<typeof vi.fn>;
  remove:                ReturnType<typeof vi.fn>;
};

function makeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    query: { entityType: 'INVOICE', entityId: '5' },
    params: { id: '9' },
    body: {},
    user: { userId: 1, username: 'accountant', roleId: 2, roleName: 'ACCOUNTANT' },
    permissions: ['invoices.read', 'invoices.update'],
    ...overrides,
  };
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('attachmentsController.list', () => {
  it('enforces read permission before listing', async () => {
    mockService.assertReadPermission.mockImplementation(() => {
      throw new Error('forbidden');
    });
    const req = makeReq();
    await expect(attachmentsController.list(req as never, makeRes() as never)).rejects.toThrow('forbidden');
    expect(mockService.list).not.toHaveBeenCalled();
  });

  it('lists attachments once the permission check passes', async () => {
    mockService.list.mockResolvedValue([{ id: 1 }]);
    const req = makeReq();
    const res = makeRes();
    await attachmentsController.list(req as never, res as never);
    expect(mockService.assertReadPermission).toHaveBeenCalledWith('INVOICE', 'ACCOUNTANT', req.permissions);
    expect(mockService.list).toHaveBeenCalledWith('INVOICE', 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('attachmentsController.create', () => {
  it('rejects when no file was uploaded, without touching the service', async () => {
    const req = makeReq({ file: undefined });
    await expect(attachmentsController.create(req as never, makeRes() as never)).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded file when write permission is denied', async () => {
    mockService.assertWritePermission.mockImplementation(() => {
      throw new Error('forbidden');
    });
    mockFs.existsSync.mockReturnValue(true);
    const req = makeReq({ file: { path: '/tmp/upload-1', filename: 'a', originalname: 'a.pdf', size: 10, mimetype: 'application/pdf' } });

    await expect(attachmentsController.create(req as never, makeRes() as never)).rejects.toThrow('forbidden');

    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/upload-1');
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('persists the attachment once write permission passes', async () => {
    mockService.create.mockResolvedValue({ id: 42 });
    const file = { path: '/tmp/upload-2', filename: 'b', originalname: 'invoice.pdf', size: 20, mimetype: 'application/pdf' };
    const req = makeReq({ file, body: { title: 'فاتورة موقعة' } });
    const res = makeRes();

    await attachmentsController.create(req as never, res as never);

    expect(mockService.create).toHaveBeenCalledWith('INVOICE', 5, 'فاتورة موقعة', file, 1, req);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('attachmentsController.remove', () => {
  it('enforces write permission against the attachment\'s own entityType before deleting', async () => {
    mockService.findEntityType.mockResolvedValue('EXPENSE');
    mockService.assertWritePermission.mockImplementation(() => {
      throw new Error('forbidden');
    });
    const req = makeReq();

    await expect(attachmentsController.remove(req as never, makeRes() as never)).rejects.toThrow('forbidden');

    expect(mockService.assertWritePermission).toHaveBeenCalledWith('EXPENSE', 'ACCOUNTANT', req.permissions, expect.any(String));
    expect(mockService.remove).not.toHaveBeenCalled();
  });

  it('deletes once permission passes', async () => {
    mockService.findEntityType.mockResolvedValue('INVOICE');
    const req = makeReq();
    const res = makeRes();

    await attachmentsController.remove(req as never, res as never);

    expect(mockService.remove).toHaveBeenCalledWith(9, 1, req);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('skips the permission check (and lets the service report not-found) when the attachment does not exist', async () => {
    mockService.findEntityType.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();

    await attachmentsController.remove(req as never, res as never);

    expect(mockService.assertWritePermission).not.toHaveBeenCalled();
    expect(mockService.remove).toHaveBeenCalledWith(9, 1, req);
  });
});
