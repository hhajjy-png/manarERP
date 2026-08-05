import { describe, it, expect, vi } from 'vitest';
import {
  parseClientConfigJson,
  resolveClientCredentials,
  PACKAGED_OAUTH_CLIENT_FILENAME,
  DEV_OAUTH_CLIENT_FILENAME,
} from '../googleDriveClientConfig.pure';

describe('parseClientConfigJson', () => {
  it('parses a valid clientId/clientSecret pair', () => {
    expect(parseClientConfigJson(JSON.stringify({ clientId: 'id-1', clientSecret: 'secret-1' }))).toEqual({
      clientId: 'id-1',
      clientSecret: 'secret-1',
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseClientConfigJson('{ this is not json')).toBeNull();
  });

  it('returns null when clientId is missing', () => {
    expect(parseClientConfigJson(JSON.stringify({ clientSecret: 'secret-1' }))).toBeNull();
  });

  it('returns null when clientSecret is missing', () => {
    expect(parseClientConfigJson(JSON.stringify({ clientId: 'id-1' }))).toBeNull();
  });

  it('returns null when fields are empty strings', () => {
    expect(parseClientConfigJson(JSON.stringify({ clientId: '', clientSecret: '' }))).toBeNull();
  });

  it('returns null when fields are the wrong type', () => {
    expect(parseClientConfigJson(JSON.stringify({ clientId: 123, clientSecret: true }))).toBeNull();
  });
});

describe('resolveClientCredentials — env var override (works in dev and packaged)', () => {
  it('prefers env vars over any file, in dev', () => {
    const readConfigFile = vi.fn();
    const result = resolveClientCredentials({
      envClientId: 'env-id',
      envClientSecret: 'env-secret',
      isPackaged: false,
      readConfigFile,
    });
    expect(result).toEqual({ credentials: { clientId: 'env-id', clientSecret: 'env-secret' } });
    expect(readConfigFile).not.toHaveBeenCalled();
  });

  it('prefers env vars over the bundled packaged resource', () => {
    const readConfigFile = vi.fn();
    const result = resolveClientCredentials({
      envClientId: 'env-id',
      envClientSecret: 'env-secret',
      isPackaged: true,
      readConfigFile,
    });
    expect(result).toEqual({ credentials: { clientId: 'env-id', clientSecret: 'env-secret' } });
    expect(readConfigFile).not.toHaveBeenCalled();
  });

  it('ignores a partial env var pair (only one of the two set)', () => {
    const result = resolveClientCredentials({
      envClientId: 'env-id',
      envClientSecret: undefined,
      isPackaged: false,
      readConfigFile: () => JSON.stringify({ clientId: 'dev-id', clientSecret: 'dev-secret' }),
    });
    expect(result.credentials).toEqual({ clientId: 'dev-id', clientSecret: 'dev-secret' });
  });
});

describe('resolveClientCredentials — development resolution', () => {
  it('reads the dev-scoped file and returns valid credentials', () => {
    const readConfigFile = vi.fn((kind: 'packaged' | 'dev') =>
      kind === 'dev' ? JSON.stringify({ clientId: 'dev-id', clientSecret: 'dev-secret' }) : null,
    );
    const result = resolveClientCredentials({ isPackaged: false, readConfigFile });
    expect(result).toEqual({ credentials: { clientId: 'dev-id', clientSecret: 'dev-secret' } });
    expect(readConfigFile).toHaveBeenCalledWith('dev');
    expect(readConfigFile).not.toHaveBeenCalledWith('packaged');
  });

  it('returns null with no diagnostic when the dev file is simply absent (normal unconfigured dev state)', () => {
    const result = resolveClientCredentials({ isPackaged: false, readConfigFile: () => null });
    expect(result).toEqual({ credentials: null });
  });

  it('returns null when the dev file is invalid JSON', () => {
    const result = resolveClientCredentials({ isPackaged: false, readConfigFile: () => '{ broken' });
    expect(result.credentials).toBeNull();
  });
});

describe('resolveClientCredentials — packaged production resolution', () => {
  it('reads the packaged bundled resource and returns valid credentials', () => {
    const readConfigFile = vi.fn((kind: 'packaged' | 'dev') =>
      kind === 'packaged' ? JSON.stringify({ clientId: 'prod-id', clientSecret: 'prod-secret' }) : null,
    );
    const result = resolveClientCredentials({ isPackaged: true, readConfigFile });
    expect(result).toEqual({ credentials: { clientId: 'prod-id', clientSecret: 'prod-secret' } });
    expect(readConfigFile).toHaveBeenCalledWith('packaged');
    expect(readConfigFile).not.toHaveBeenCalledWith('dev');
  });

  it('never falls back to the dev-scoped file when packaged', () => {
    const readConfigFile = vi.fn((kind: 'packaged' | 'dev') =>
      kind === 'dev' ? JSON.stringify({ clientId: 'dev-id', clientSecret: 'dev-secret' }) : null,
    );
    const result = resolveClientCredentials({ isPackaged: true, readConfigFile });
    expect(result.credentials).toBeNull();
    expect(readConfigFile).not.toHaveBeenCalledWith('dev');
  });
});

describe('resolveClientCredentials — missing packaged configuration', () => {
  it('returns null with a developer-facing diagnostic naming the expected filename, never end-user instructions', () => {
    const result = resolveClientCredentials({ isPackaged: true, readConfigFile: () => null });
    expect(result.credentials).toBeNull();
    expect(result.diagnostic).toContain(PACKAGED_OAUTH_CLIENT_FILENAME);
    expect(result.diagnostic).not.toMatch(/gdrive-client\.json/);
    expect(result.diagnostic).not.toMatch(/Google Cloud/i);
  });
});

describe('resolveClientCredentials — invalid packaged configuration', () => {
  it('returns null with a diagnostic when the bundled file is malformed JSON', () => {
    const result = resolveClientCredentials({ isPackaged: true, readConfigFile: () => '{ not valid json' });
    expect(result.credentials).toBeNull();
    expect(result.diagnostic).toContain(PACKAGED_OAUTH_CLIENT_FILENAME);
  });

  it('returns null with a diagnostic when the bundled file is missing required fields', () => {
    const result = resolveClientCredentials({
      isPackaged: true,
      readConfigFile: () => JSON.stringify({ clientId: 'only-id' }),
    });
    expect(result.credentials).toBeNull();
    expect(result.diagnostic).toBeDefined();
  });
});

describe('resolveClientCredentials — shape compatibility with the existing OAuth flow', () => {
  it('returns exactly a { clientId, clientSecret } pair regardless of source, so runAuthFlow/createOAuthClient are unaffected', () => {
    const fromEnv = resolveClientCredentials({
      envClientId: 'a',
      envClientSecret: 'b',
      isPackaged: false,
      readConfigFile: () => null,
    }).credentials;
    const fromDev = resolveClientCredentials({
      isPackaged: false,
      readConfigFile: () => JSON.stringify({ clientId: 'a', clientSecret: 'b' }),
    }).credentials;
    const fromPackaged = resolveClientCredentials({
      isPackaged: true,
      readConfigFile: () => JSON.stringify({ clientId: 'a', clientSecret: 'b' }),
    }).credentials;

    for (const creds of [fromEnv, fromDev, fromPackaged]) {
      expect(Object.keys(creds ?? {}).sort()).toEqual(['clientId', 'clientSecret']);
      expect(creds).toEqual({ clientId: 'a', clientSecret: 'b' });
    }
  });
});

describe('filenames', () => {
  it('keeps the packaged and dev config filenames distinct', () => {
    expect(PACKAGED_OAUTH_CLIENT_FILENAME).not.toBe(DEV_OAUTH_CLIENT_FILENAME);
  });
});
