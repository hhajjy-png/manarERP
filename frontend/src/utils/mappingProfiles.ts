// Smart Import Assistant (Phase 2B-G) — saved mapping profiles.
// Stores ONLY headers + field mapping (never file contents or row data). Keyed by
// entity + normalized header signature.
//
// Zero Data Loss Certification Pack v1: هذه ملفات يبنيها المستخدم بيده لكل شكل ملف
// وارد، وكانت تعيش في `localStorage` وحده — خارج النسخ الاحتياطي والمزامنة، وتضيع
// عند الانتقال إلى جهاز جديد. صارت تُحفظ في قاعدة البيانات عبر `persistPreference`
// (القراءة تبقى متزامنة من المخبأ المحلي — لا تغيير في سلوك أي مستدعٍ).

import { normalizeHeader } from './headerIntelligence';
import { persistPreference } from '../lib/syncedPreferences';

const STORAGE_KEY = 'manar.import.mapping_profiles';

export interface MappingProfile {
  entity: string;
  headerSignature: string;
  mapping: Record<string, string>;   // excelHeader → system field key (or '__ignore__')
  createdAt: string;
  updatedAt: string;
  profileName?: string;
}

/** Order-independent signature of a header set for a given entity. */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => normalizeHeader(h)).filter(Boolean).sort().join('|');
}

function readAll(): MappingProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MappingProfile[]) : [];
  } catch {
    return [];
  }
}

function writeAll(profiles: MappingProfile[]): void {
  try {
    persistPreference(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* storage full / unavailable — profiles are a convenience, ignore */
  }
}

export function listProfiles(entity: string): MappingProfile[] {
  return readAll().filter((p) => p.entity === entity);
}

/** Exact profile for this entity + header signature, if saved. */
export function getProfile(entity: string, signature: string): MappingProfile | null {
  return readAll().find((p) => p.entity === entity && p.headerSignature === signature) ?? null;
}

/** Create or update the profile for entity + signature. Returns the saved profile. */
export function saveProfile(
  entity: string,
  signature: string,
  mapping: Record<string, string>,
  profileName?: string,
): MappingProfile {
  const all = readAll();
  const now = new Date().toISOString();
  const idx = all.findIndex((p) => p.entity === entity && p.headerSignature === signature);
  let profile: MappingProfile;
  if (idx >= 0) {
    profile = { ...all[idx], mapping, updatedAt: now, profileName: profileName ?? all[idx].profileName };
    all[idx] = profile;
  } else {
    profile = { entity, headerSignature: signature, mapping, createdAt: now, updatedAt: now, profileName };
    all.push(profile);
  }
  writeAll(all);
  return profile;
}

export function deleteProfile(entity: string, signature: string): void {
  writeAll(readAll().filter((p) => !(p.entity === entity && p.headerSignature === signature)));
}
