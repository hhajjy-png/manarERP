// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  headerSignature,
  saveProfile,
  getProfile,
  listProfiles,
  deleteProfile,
} from '../mappingProfiles';

beforeEach(() => localStorage.clear());

describe('headerSignature', () => {
  it('is order-independent and normalized', () => {
    const a = headerSignature(['الرقم الوظيفي', 'اسم الموظف']);
    const b = headerSignature(['اسم الموظف', 'الرقم الوظيفي']);
    expect(a).toBe(b);
  });
});

describe('mapping profile CRUD (localStorage)', () => {
  it('saves, retrieves, lists, and deletes a profile', () => {
    const sig = headerSignature(['الرقم الوظيفي', 'رقم المدنى']);
    expect(getProfile('employees', sig)).toBeNull();

    const saved = saveProfile('employees', sig, { 'رقم المدنى': 'civilId' }, 'ملف الموظفين');
    expect(saved.mapping).toEqual({ 'رقم المدنى': 'civilId' });
    expect(saved.profileName).toBe('ملف الموظفين');

    const got = getProfile('employees', sig);
    expect(got?.mapping).toEqual({ 'رقم المدنى': 'civilId' });
    expect(listProfiles('employees')).toHaveLength(1);
    // different entity is isolated
    expect(listProfiles('customers')).toHaveLength(0);

    deleteProfile('employees', sig);
    expect(getProfile('employees', sig)).toBeNull();
  });

  it('updating the same signature does not duplicate', () => {
    const sig = headerSignature(['a', 'b']);
    saveProfile('customers', sig, { a: 'code' });
    saveProfile('customers', sig, { a: 'code', b: 'name' });
    expect(listProfiles('customers')).toHaveLength(1);
    expect(getProfile('customers', sig)?.mapping).toEqual({ a: 'code', b: 'name' });
  });

  it('stores only headers + mapping (no row data keys)', () => {
    const sig = headerSignature(['h1']);
    const p = saveProfile('suppliers', sig, { h1: 'code' });
    expect(Object.keys(p).sort()).toEqual(
      ['createdAt', 'entity', 'headerSignature', 'mapping', 'profileName', 'updatedAt'].sort(),
    );
  });
});
