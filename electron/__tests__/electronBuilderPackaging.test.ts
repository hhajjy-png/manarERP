import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PACKAGED_OAUTH_CLIENT_FILENAME } from '../services/googleDriveClientConfig.pure';

/**
 * Google Drive Deployment Pack v1 — verifies the bundled OAuth client config is
 * actually declared in the real build/package configuration (electron-builder.yml),
 * not only resolved correctly in isolation by the credential-resolution unit tests.
 * A drive-by edit that removes this extraResources entry would otherwise silently
 * ship an installer whose packaged app can never resolve OAuth credentials.
 */
describe('electron-builder.yml — packaged Google Drive OAuth resource', () => {
  const configPath = path.join(__dirname, '..', '..', 'electron-builder.yml');
  const config = fs.readFileSync(configPath, 'utf8');

  it('declares an extraResources entry copying the developer-provisioned OAuth client config', () => {
    const entryPattern = new RegExp(
      `from:\\s*electron/resources/gdrive-oauth-client\\.json\\s*\\n\\s*to:\\s*${PACKAGED_OAUTH_CLIENT_FILENAME}`,
    );
    expect(config).toMatch(entryPattern);
  });

  it('the source path resolves under electron/resources (matches the runtime resolver\'s expected filename)', () => {
    expect(config).toContain(`electron/resources/gdrive-oauth-client.json`);
  });
});

describe('electron/resources/ — developer setup scaffolding', () => {
  const resourcesDir = path.join(__dirname, '..', 'resources');

  it('ships a committed .example.json template (not the real credentials file)', () => {
    expect(fs.existsSync(path.join(resourcesDir, 'gdrive-oauth-client.example.json'))).toBe(true);
  });

  it('the example template has the expected clientId/clientSecret shape', () => {
    const raw = fs.readFileSync(path.join(resourcesDir, 'gdrive-oauth-client.example.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed.clientId).toBe('string');
    expect(typeof parsed.clientSecret).toBe('string');
  });

  it('documents the one-time developer/release setup step', () => {
    expect(fs.existsSync(path.join(resourcesDir, 'README.md'))).toBe(true);
  });
});

describe('.gitignore — the real credential file is never committed', () => {
  it('ignores electron/resources/gdrive-oauth-client.json', () => {
    const gitignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
    expect(gitignore).toContain('electron/resources/gdrive-oauth-client.json');
  });
});
