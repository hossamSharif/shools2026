import { describe, expect, it } from 'vitest';
import {
  NEVER_GRANTABLE,
  OPTIONAL_PERMISSIONS,
  OPTIONAL_PERMISSION_KEYS,
  PERMISSION_KEYS,
  ROLES,
  ROLE_DEFAULTS,
  ROLE_PRECEDENCE,
  primaryRole,
} from './keys.js';

const allKeys = new Set<string>(PERMISSION_KEYS.map((d) => d.key));

describe('permission vocabulary', () => {
  it('has no duplicate keys', () => {
    expect(allKeys.size).toBe(PERMISSION_KEYS.length);
  });

  it('every optional permission key exists in PERMISSION_KEYS', () => {
    for (const o of OPTIONAL_PERMISSIONS) expect(allKeys.has(o.key)).toBe(true);
    for (const k of OPTIONAL_PERMISSION_KEYS) expect(allKeys.has(k)).toBe(true);
  });

  it('no optional permission row is never-grantable for its role', () => {
    for (const o of OPTIONAL_PERMISSIONS) {
      expect(NEVER_GRANTABLE[o.role]).not.toContain(o.key);
    }
  });

  it('has exactly the 6 FR-010 switches and no principal finance switch', () => {
    expect(OPTIONAL_PERMISSIONS).toHaveLength(6);
    expect(
      OPTIONAL_PERMISSIONS.some((o) => o.role === 'principal' && o.key.startsWith('finance.')),
    ).toBe(false);
    const viewerExport = OPTIONAL_PERMISSIONS.find((o) => o.role === 'viewer');
    expect(viewerExport).toMatchObject({ key: 'finance.export', defaultEnabled: true });
  });

  it('no default grant is never-grantable for its role, and defaults use known keys', () => {
    for (const role of ROLES) {
      for (const key of ROLE_DEFAULTS[role]) {
        expect(allKeys.has(key)).toBe(true);
        expect(NEVER_GRANTABLE[role]).not.toContain(key);
      }
    }
  });

  it('a default is never also an optional switch for the same role', () => {
    for (const o of OPTIONAL_PERMISSIONS) {
      expect(ROLE_DEFAULTS[o.role]).not.toContain(o.key);
    }
  });

  it('finance.read is held only by school_admin, accountant and viewer (Article XIV)', () => {
    const holders = ROLES.filter((r) => ROLE_DEFAULTS[r].includes('finance.read'));
    expect(holders.sort()).toEqual(['accountant', 'school_admin', 'viewer']);
  });

  it('super_admin holds no key', () => {
    expect(ROLE_DEFAULTS.super_admin).toHaveLength(0);
  });

  it('precedence covers every role except super_admin', () => {
    expect([...ROLE_PRECEDENCE].sort()).toEqual(ROLES.filter((r) => r !== 'super_admin').sort());
    expect(primaryRole(['viewer', 'principal'])).toBe('principal');
    expect(primaryRole(['teacher', 'student_affairs'])).toBe('student_affairs');
    expect(primaryRole([])).toBeNull();
  });
});
