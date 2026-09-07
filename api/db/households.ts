import { newId, nowIso, row, rows, run } from './db.ts';
import type { Profile } from './types.ts';

export interface Household {
  id: string;
  name: string;
  passwordHash: string;
  timezone: string;
}

interface HouseholdRow {
  id: string;
  name: string;
  password_hash: string;
  timezone: string;
}

/** v1 has exactly one household; the row is the whole tenancy boundary. */
export function getHousehold(): Household | null {
  const r = row<HouseholdRow>('SELECT * FROM households ORDER BY created_at LIMIT 1');
  return r ? { id: r.id, name: r.name, passwordHash: r.password_hash, timezone: r.timezone } : null;
}

export function createHousehold(name: string, passwordHash: string, timezone = 'Asia/Tokyo'): Household {
  const id = newId();
  run(
    'INSERT INTO households (id, name, password_hash, timezone, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    name,
    passwordHash,
    timezone,
    nowIso(),
  );
  return { id, name, passwordHash, timezone };
}

export function setHouseholdPassword(id: string, passwordHash: string) {
  run('UPDATE households SET password_hash = ? WHERE id = ?', passwordHash, id);
}

export function listProfiles(householdId: string): Profile[] {
  return rows<Profile>('SELECT id, name FROM profiles WHERE household_id = ? ORDER BY created_at', householdId);
}

export function getProfile(householdId: string, id: string): Profile | null {
  return row<Profile>('SELECT id, name FROM profiles WHERE household_id = ? AND id = ?', householdId, id);
}

export function createProfile(householdId: string, name: string): Profile {
  const id = newId();
  run('INSERT INTO profiles (id, household_id, name, created_at) VALUES (?, ?, ?, ?)', id, householdId, name, nowIso());
  return { id, name };
}
