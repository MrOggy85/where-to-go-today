/**
 * Creates the household, its two adult profiles and, with --demo, a handful of places to
 * make the Today page meaningful before any real data exists.
 *
 *   deno run -A scripts/seed.ts --password=... --profiles=Alice,Bob [--demo] [--force]
 *
 * Re-running is safe: it refuses to touch an existing household unless --force is given,
 * in which case it only resets the password.
 */
import { db, nowIso } from '../api/db/db.ts';
import {
  createHousehold,
  createProfile,
  getHousehold,
  listProfiles,
  setHouseholdPassword,
} from '../api/db/households.ts';
import { createPlace } from '../api/db/places.ts';
import { createVisit } from '../api/db/visits.ts';
import { hashPassword } from '../api/auth/password.ts';
import type { PlaceInput } from '../api/db/places.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return Deno.args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const flag = (name: string) => Deno.args.includes(`--${name}`);

const password = arg('password') ?? Deno.env.get('HOUSEHOLD_PASSWORD');
if (!password) {
  console.error('missing --password=<password> (or HOUSEHOLD_PASSWORD env var)');
  Deno.exit(1);
}

const householdName = arg('name') ?? 'Home';
const profileNames = (arg('profiles') ?? 'Adult 1,Adult 2').split(',').map((s) => s.trim()).filter(Boolean);

let household = getHousehold();

if (household) {
  if (!flag('force')) {
    console.error(`household "${household.name}" already exists; pass --force to reset its password`);
    Deno.exit(1);
  }
  setHouseholdPassword(household.id, await hashPassword(password));
  console.log('password reset');
} else {
  household = createHousehold(householdName, await hashPassword(password), arg('timezone') ?? 'Asia/Tokyo');
  console.log(`created household "${household.name}"`);
}

const existing = listProfiles(household.id);
for (const name of profileNames) {
  if (existing.some((p) => p.name === name)) continue;
  const p = createProfile(household.id, name);
  console.log(`created profile "${p.name}"`);
}

if (flag('demo')) seedDemoPlaces(household.id);

function base(name: string, environment: PlaceInput['environment']): PlaceInput {
  return {
    name,
    status: 'active',
    environment,
    categories: [],
    address: null,
    latitude: null,
    longitude: null,
    google_maps_url: null,
    website_url: null,
    drive_minutes: null,
    train_minutes: null,
    typical_duration_hours: null,
    cost_level: null,
    good_for_rain: null,
    good_for_hot_weather: null,
    good_for_cold_weather: null,
    good_for_wind: null,
    shaded: null,
    parking: null,
    food_available: null,
    toilets: null,
    priority: 1,
    notes: null,
  };
}

function seedDemoPlaces(householdId: string) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM places WHERE household_id = ?').get(householdId) as { n: number };
  if (count.n > 0) {
    console.log('places already exist, skipping demo data');
    return;
  }

  const profile = listProfiles(householdId)[0] ?? null;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  const demo: { input: PlaceInput; visitedDaysAgo?: number[] }[] = [
    {
      input: {
        ...base('Anpanman Museum', 'indoor'),
        categories: ['museum', 'kids'],
        drive_minutes: 22,
        train_minutes: 35,
        typical_duration_hours: 3,
        cost_level: 'high',
        parking: 'yes',
        toilets: 'yes',
        food_available: 'yes',
        priority: 2,
      },
      visitedDaysAgo: [114],
    },
    {
      input: {
        ...base('Kodomo no Kuni', 'outdoor'),
        categories: ['park', 'playground'],
        drive_minutes: 30,
        typical_duration_hours: 4,
        good_for_hot_weather: 0,
        shaded: 1,
        parking: 'yes',
        toilets: 'yes',
        priority: 3,
      },
      visitedDaysAgo: [210],
    },
    {
      input: {
        ...base('Local indoor playground', 'indoor'),
        categories: ['playground'],
        drive_minutes: 12,
        typical_duration_hours: 1.5,
        cost_level: 'low',
        good_for_rain: 1,
        toilets: 'yes',
      },
    },
    {
      input: {
        ...base('Riverside park', 'outdoor'),
        categories: ['park'],
        drive_minutes: 8,
        typical_duration_hours: 1,
        shaded: 0,
        good_for_wind: 0,
      },
      visitedDaysAgo: [3],
    },
    {
      input: {
        ...base('Aquarium', 'indoor'),
        categories: ['aquarium'],
        drive_minutes: 50,
        train_minutes: 40,
        typical_duration_hours: 3.5,
        cost_level: 'high',
        good_for_rain: 1,
      },
    },
    {
      input: {
        ...base('Shopping mall', 'mixed'),
        categories: ['mall'],
        drive_minutes: 15,
        typical_duration_hours: 2,
        good_for_rain: 1,
        food_available: 'yes',
      },
      visitedDaysAgo: [21],
    },
  ];

  for (const { input, visitedDaysAgo } of demo) {
    const place = createPlace(householdId, profile?.id ?? null, input);
    for (const d of visitedDaysAgo ?? []) {
      createVisit(householdId, place.id, profile?.id ?? null, { visitedAt: daysAgo(d), note: null, rating: null });
    }
    console.log(`created place "${place.name}"`);
  }
}

console.log(`done at ${nowIso()}`);
