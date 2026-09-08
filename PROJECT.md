# What Should We Do Today? — Project Founding Document

> Working title. Rename the project later if a better name appears.
>
> This document is the product and technical design contract for the repository. Read it before adding features. Prefer the smallest implementation that preserves the core product idea.

## 1. What this is

A private family web app that answers a recurring question:

**What should we do today?**

The household has many possible places to visit — playgrounds, parks, museums, malls, indoor play areas, zoos, pools, events, restaurants, and other family destinations — but choosing among them is harder than it should be.

The app keeps a curated database of:

- places we have already visited,
- places we want to visit,
- when we last visited them,
- whether they fit today's weather and available time,
- practical notes that matter to our family,
- visit notes and photos.

Its primary job is **decision support and inspiration**.

Its secondary job is to become a lightweight **family outing diary**.

This is not intended to replace Google Maps. Google Maps remains useful for navigation, reviews, opening hours, and discovering arbitrary places. This app is a small opinionated layer over the subset of places that matter to our family.

## 2. Product thesis

The app should reduce a large, vague choice into a small, useful set of options.

Opening the app should quickly produce something like:

> ### Good choices today
>
> **Anpanman Museum**
> Rainy today · indoor · 22 min away · last visited 114 days ago
>
> **Kodomo no Kuni**
> Dry this afternoon · good temperature · last visited 7 months ago
>
> **Local indoor playground**
> Indoor · 12 min away · never visited

A recommendation is useful only if the user can understand **why** it was recommended.

The app therefore uses transparent rules and scoring rather than an opaque AI recommendation engine.

## 3. Target users

Initially there is one household with one shared household login and two adult profiles. After login, the user selects which adult profile they are using so actions can be attributed to the correct person.

Primary devices:

- iPhone
- iPad
- desktop browser when managing data

The interface should be mobile-first. A recommendation should be obtainable with very little typing.

Children do not need accounts in v1.

## 4. Core user loop

The main loop is:

1. Open the app.
2. See today's weather/context.
3. Optionally adjust constraints such as available time or maximum travel time.
4. See a short ranked list of suitable places.
5. Pick a place.
6. Open its details and optionally jump to Google Maps/navigation.
7. After or during the outing, record a visit.
8. Optionally add a note and photos.
9. That visit automatically affects future recommendations.

The app should also work as a browsable database when the user does not want recommendations.

## 5. Product principles

### 5.1 Family-specific beats general-purpose

Store the details that affect *our* decisions, not everything a public places database could contain.

For example, "good on a very hot day" may matter more than a generic five-star rating.

### 5.2 Adding a place must be easy

If adding a place becomes data entry work, the database will not grow.

Only a small set of fields should be required:

- name
- location or Google Maps link
- indoor / outdoor / mixed

Everything else can be added later.

### 5.3 Recording a visit must be even easier

The minimum action is:

**Mark as visited today.**

Notes, photos, ratings, and participants are optional.

### 5.4 Recommendations must be explainable

Every recommendation should expose its important reasons, for example:

- "Never visited"
- "Last visited 5 months ago"
- "Good for rain"
- "Indoor"
- "20 min drive"
- "Favorite"
- "Good for a short afternoon"

Do not show an unexplained numeric score to normal users.

### 5.5 The app owns family opinions, not public facts

Where possible, link to external sources instead of trying to maintain a full copy of public place information.

For example:

- keep a Google Maps URL,
- keep the official website URL,
- keep our own practical notes,
- do not build a general review database.

### 5.6 Privacy is a product requirement

This app contains information about a family's habits and may contain family photos.

It is private by default:

- no public profiles,
- no public gallery,
- no public place pages,
- no unauthenticated data API,
- no permanent public image URLs.

## 6. Main concepts

### Place

A destination that the family might choose.

Examples:

- playground
- park
- museum
- mall
- indoor play center
- zoo
- aquarium
- pool
- beach
- hiking area
- restaurant/cafe
- seasonal destination
- event venue

### Visit

A record that the family went to a place at a particular time.

A visit is append-only historical information. Editing notes/photos is allowed, but recording a new outing should create a new visit rather than modifying "last visited" directly.

### Photo

A private image attached to a visit, and indirectly to a place.

### Recommendation

A temporary ranking produced from the current context plus place and visit data. Recommendations do not need to be stored.

### Household

The private boundary around the data.

The initial product has exactly one household, but data keys and authorization should not make supporting multiple households impossible later.

## 7. Place data model

Suggested TypeScript shape:

```ts
type PlaceEnvironment = 'indoor' | 'outdoor' | 'mixed';
// "Want to go" is derived, not stored: an active place with no visits yet.
type PlaceStatus = 'active' | 'archived';
type CostLevel = 'free' | 'low' | 'medium' | 'high';

interface Place {
  id: string;
  householdId: string;

  name: string;
  status: PlaceStatus;

  // Household-owned records, not free text: chosen from a list, renamed in one place.
  categories: { id: string; name: string }[];
  environment: PlaceEnvironment;

  address?: string;
  latitude?: number;
  longitude?: number;

  googleMapsUrl?: string;
  websiteUrl?: string;

  // Family-specific planning metadata.
  driveMinutes?: number;
  trainMinutes?: number;
  // Hours, because an hour is the unit families plan an outing in. Halves are allowed.
  typicalDurationHours?: number;
  costLevel?: CostLevel;

  goodForRain?: boolean;
  goodForHotWeather?: boolean;
  goodForColdWeather?: boolean;
  goodForWind?: boolean;
  shaded?: boolean;

  parking?: 'yes' | 'no' | 'unknown';
  foodAvailable?: 'yes' | 'no' | 'unknown';
  toilets?: 'yes' | 'no' | 'unknown';

  // 1 = normal, larger values mean "we particularly want to go here".
  priority?: number;

  notes?: string;

  createdAt: string;
  updatedAt: string;
  createdByProfileId: string;
}
```

Do not require most fields.

A sparse record is valid.

## 8. Visit data model

```ts
interface Visit {
  id: string;
  householdId: string;
  placeId: string;

  visitedAt: string;

  note?: string;

  // Optional family impression, not a public review score.
  rating?: 1 | 2 | 3 | 4 | 5;

  createdAt: string;
  createdByProfileId: string;
}
```

Derived data such as `lastVisitedAt` may be cached separately for recommendation performance, but the visit log is the source of truth.

## 9. Photo data model

Photos are compressed memory copies stored on the home server filesystem. They are not intended to replace the family's canonical photo archive.

SQLite stores only photo metadata:

```ts
interface Photo {
  id: string;
  householdId: string;
  visitId: string;
  placeId: string;

  filename: string;
  contentType: string;
  sizeBytes: number;

  width?: number;
  height?: number;

  capturedAt?: string;
  uploadedAt: string;
  uploadedByProfileId: string;
}
```

Local photo storage requirements:

- files live under a dedicated private data directory, for example `/data/photos/`
- filenames are random/opaque rather than derived from user input
- photo reads are authorized through the application
- uploaded images are resized/compressed before long-term storage
- deletion from the app removes both SQLite metadata and the local file
- the photo directory is included in backups
- the web server must not expose the raw photo directory as unauthenticated static files

The app is **not** the canonical family photo archive. Photos are memory attachments to outings. Avoid building a replacement for Apple Photos / Google Photos.

## 10. Recommendation model

The initial recommendation engine should be deterministic and small.

Do not start with machine learning or an LLM.

### 10.1 Step 1 — collect today's context

Inputs may include:

```ts
interface RecommendationContext {
  now: string;

  weather: {
    temperatureC: number;
    precipitationProbability?: number;
    precipitationMm?: number;
    windKph?: number;
    condition?: string;
  };

  availableMinutes?: number;
  maxTravelMinutes?: number;

  preferredCategories?: string[];
}
```

The default screen should work without asking the user to fill this in every time.

Household defaults can provide values such as maximum normal driving time.

### 10.2 Step 2 — eligibility filters

Exclude places that are clearly bad choices.

Examples:

- archived place
- estimated drive time exceeds an explicitly selected maximum
- typical duration cannot fit the available time
- outdoor-only place during clearly unsuitable rain, when it is not marked rain-friendly

Filters should be conservative. Lack of metadata should generally mean "unknown", not "exclude".

### 10.3 Step 3 — score remaining places

The most important factors for v1 are:

1. **Weather suitability**
2. **Recency / novelty**
3. **Never visited boost**
4. **Household priority**
5. **Travel-time fit**
6. **Optional category rotation**

A conceptual score is enough:

```txt
score =
  weatherFit
  + recency
  + neverVisitedBoost
  + priority
  + travelTimeFit
  + variety
```

Weights belong in one configuration module so they can be adjusted without rewriting the engine.

### 10.4 Recency

A place should gradually become more attractive as time passes since the last visit.

Possible behavior:

- visited yesterday -> strong penalty
- visited last week -> moderate penalty
- visited a month ago -> small penalty
- visited several months ago -> neutral/positive
- never visited -> meaningful boost

The curve is the same for every place. Per-place cooldown overrides were tried and removed:
the household could not say what a useful value would be, so the field only added a form row.

Do not use a hard global cooldown unless the product proves it is useful.

### 10.5 Weather

Weather should first classify today's conditions rather than attempt sophisticated meteorology. "Today" means the current local calendar day when the user opens the app, using the household timezone (default `Asia/Tokyo`).

Useful classifications:

- dry / rainy
- comfortable / hot / very hot (30°C+ with no meaningful cloud cover is considered too hot for normal outdoor activities)
- cool / cold (cold alone never excludes outdoor activities)
- calm / windy

A place can then have simple traits such as:

- indoor
- mixed
- good in rain
- good in heat
- shaded

Rain is considered unsuitable for normal outdoor-only activities unless a place is explicitly marked as rain-friendly. There is no low-temperature cutoff for outdoor activities.

The score should be easy to reason about.

### 10.6 Explain the result

The recommendation API should return reasons along with the place.

Example:

```ts
interface Recommendation {
  place: Place;
  score: number;
  reasons: string[];
}
```

Possible reasons:

```txt
["Indoor", "Rain expected", "Last visited 142 days ago"]
["Never visited", "18 min drive", "Good for hot weather"]
```

The numeric score is primarily an implementation detail.

## 11. Weather integration

Weather is external data and should be behind a small provider interface.

```ts
interface WeatherProvider {
  getForecast(location: GeoPoint, at: Date): Promise<WeatherSnapshot>;
}
```

Do not let provider-specific response types leak into application code.

Requirements:

- cache weather responses
- tolerate provider failure
- recommendation browsing still works if weather is unavailable
- show when weather information is stale or unavailable
- no recommendation should fail solely because the weather API failed

For v1, weather near the household/home area is enough if most destinations are geographically close.

If places cover a much larger area later, weather can be fetched per destination/region.

## 12. Opening hours

Opening-hours data is useful but is **not a v1 dependency**.

Accurate opening hours introduce an external data-maintenance problem.

Initial approach:

- optional free-text opening-hours note
- official website link
- optional manual fields such as `closedWeekdays`
- do not claim a place is open unless the data source is trustworthy

Later, a public places provider can be integrated if it proves worthwhile.

## 13. Distance and travel time

Do not make a commercial routing API mandatory for v1.

Store travel time separately for driving and train:

```ts
interface Place {
  driveMinutes?: number;
  trainMinutes?: number;
}
```

The normal acceptable travel threshold is **45 minutes**. A place is within the normal range when either its driving time or train time is 45 minutes or less. Both values should be shown when known rather than collapsing them into a single number.

For v1 these values may be entered manually. Google Maps remains the navigation tool. If automatic route calculation becomes important later, add it behind a provider interface.

## 14. Search and browsing

Besides recommendations, users need a simple place database.

Required views:

### Today

The default screen.

Contains:

- weather summary
- recommendation cards
- optional filters
- "surprise me" / pick one action

### Places

Browse/search all places.

Useful filters:

- want to go (active and never visited)
- indoor
- outdoor
- category (by id, from the household's list)
- favorites/high priority
- not visited recently
- archived

Free-text search covers name, address, notes and category names.

### Place detail

Contains:

- name
- family notes
- Google Maps link
- website link
- planning attributes
- visit history
- photos
- "visited today" action
- edit action

### Add/edit place

Fast form with progressive disclosure.

Do not present every possible field at once on mobile.

Categories are picked from the household's list rather than typed, so the same idea cannot
be spelled two ways. Creating one from inside the form is allowed; that is the only way a
category is added without visiting the manage screen.

### Categories

Manage the household's categories: add, rename, delete.

Each row shows how many places carry it. Deleting removes the tag from those places rather
than refusing, and the confirmation says how many are affected. The places themselves are
never touched.

### Diary

Reverse-chronological visit feed.

Each entry can contain:

- date
- place
- note
- photos

The diary is secondary to planning, so it should not dominate the information architecture.

## 15. Adding a place

The simplest supported path should be:

1. Tap "Add place".
2. Enter name.
3. Paste a Google Maps URL or enter location manually.
4. Choose indoor/outdoor/mixed.
5. Save.

Everything else is optional.

A later enhancement may parse information from a pasted Google Maps URL, but the first implementation must not depend on scraping Google Maps.

## 16. Authentication model

Anonymous device identity is not sufficient here.

The app contains private family data and photos and is reachable from the public internet.

### v1 approach

Use real server-side authenticated sessions.

Keep it intentionally small:

- no public signup
- one household
- one shared household login
- after login, choose one of two adult profiles so actions can be attributed to the correct person
- password-based login is acceptable for v1
- passwords are stored only as strong salted hashes
- authentication state is a random server-side session
- browser receives only an opaque session cookie

Cookie requirements:

- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- appropriate expiry
- rotate session on login

SQLite stores session records with an expiry timestamp. Expired sessions are rejected and periodically cleaned up.

Every data endpoint except login/health requires authentication.

Every request must verify that the requested object belongs to the authenticated household. Profile selection identifies who is acting, but it is not a separate authorization boundary.

Write endpoints should also reject cross-origin requests.

### Deliberate non-goals for auth v1

- public account creation
- social login
- password recovery by email
- organization/team permissions
- complex roles
- child logins

Passkeys can be considered later, but they should not block the first useful version.

## 17. Security and privacy requirements

Because the data describes family behavior and contains photos:

- repository must contain no production secrets
- production secrets are environment/configuration values
- the local photo directory is private and never exposed as unauthenticated static content
- authorization is checked server-side, never trusted to the client
- API responses must never allow one household/user id to select another household's data
- session cookies are never logged
- passwords/password hashes are never logged
- free-text fields have reasonable size limits
- upload size and MIME type are validated
- state-changing endpoints validate request origin
- login endpoint is rate limited
- logs should avoid exact home coordinates and unnecessary personal data

The app should support deletion of a place, visit, or photo without leaving obvious orphaned data.

Prefer soft/archive behavior for places with visit history rather than destroying history.

## 18. SQLite persistence

Use a normal SQLite database as the primary application datastore. The domain is naturally relational: places have visits, visits have photos, profiles create records, and recommendation queries depend on joins and recency calculations.

SQLite is the default because:

- the dataset is small,
- the app runs on one home server,
- relational queries fit the data model well,
- backup is simple,
- there is no need for a separate database service.

Keep all SQL access behind `api/db/` so route handlers do not contain ad-hoc SQL.

Suggested tables:

```txt
households
profiles
sessions
places
categories
place_categories
visits
photos
settings
```

Important relationships:

- one household has two profiles
- one place has many visits
- one visit belongs to one place
- one visit may have many photos
- visits are family-level and do not track which family members attended
- records that need attribution store `created_by_profile_id`

Useful indexes should include:

```txt
places(status)
places(drive_minutes)
places(train_minutes)
categories(household_id, name COLLATE NOCASE) UNIQUE
place_categories(category_id)
visits(place_id, visited_at DESC)
visits(visited_at DESC)
photos(visit_id)
sessions(expires_at)
```

Recommendation queries may derive the latest visit using `MAX(visits.visited_at)` or a grouped subquery. Do not duplicate `lastVisitedAt` into the place row unless profiling shows a real need.

## 20. Architecture

The project deliberately resembles the technical shape of the author's earlier small
Deno + React services: a single Deno process serving its own built client, no framework,
and all SQL confined to one layer. The sections below are the contract; that resemblance
is only the starting point.

Suggested repository layout:

```txt
/
├── api/
│   ├── main.ts
│   ├── server.ts
│   ├── auth/
│   ├── db/
│   │   ├── db.ts
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── types.ts
│   ├── recommendations/
│   ├── routes/
│   ├── services/
│   │   ├── weather.ts
│   │   └── photos.ts
│   └── client/              # generated frontend build output
│
├── client/
│   ├── src/
│   └── ...
│
├── scripts/
├── Makefile
├── README.md
├── PROJECT.md
└── CLAUDE.md
```

### Server

- Deno
- `Deno.serve`
- TypeScript
- SQLite
- local filesystem photo storage
- one origin
- API and static React files served from the same server
- no CORS requirement in normal operation

### Client

- React
- TypeScript
- CSS Modules
- esbuild
- mobile-first responsive UI

### Dependency philosophy

Keep dependencies small.

Do not add:

- a frontend framework on top of React
- Redux or another state library without a demonstrated need
- an ORM
- GraphQL
- a general-purpose backend framework
- a UI component framework
- microservices

Plain HTTP JSON endpoints are enough.

## 21. Deployment

The default deployment target is the family's home server.

Production shape, as deployed (decided 2026-09-07 — resolves open decision 14):

```txt
Internet
  -> Tailscale Funnel (HTTPS ingress, TLS terminated by Tailscale)
  -> `wtgt-tailscale` sidecar container, own tailnet node
  -> `where-to-go-today` container on shared loopback, Deno application
       -> SQLite database
       -> local `/data/photos/` directory
```

The ingress is Tailscale Funnel on a dedicated per-app tailnet node. A sidecar rather
than the host's own Tailscale client, because Funnel cannot be attached to a Tailscale
Service — the alternative would expose the host node itself, which also serves unrelated
private services, on the public internet.

Operational detail lives in `CLAUDE.md` under "Deployment".

Requirements:

- normal users must be able to access the app without Tailscale
- all production access uses HTTPS
- authentication is required before any family data or photos are returned
- the Deno process is not exposed directly to the internet
- the SQLite file is never web-accessible
- the raw photo directory is never web-accessible
- production secrets live outside git
- backups cover both the SQLite database and photo directory

Tailscale remains useful for:

- SSH
- server administration
- private operator access
- maintenance and backup workflows

Users do not need Tailscale: Funnel serves the app over public HTTPS to any browser, so
the requirement above holds. Tailscale is, however, now a dependency of the *ingress* —
if the tailnet node's key expires or Tailscale's relays are down, the app is unreachable
even though the container is healthy. That is the accepted trade for not port-forwarding
the home router. Cloudflare Tunnel over the family's own domain remains the fallback if
that trade stops being acceptable.

Deno Deploy remains a possible future deployment alternative, but it is not the default architecture and the application must not depend on Deploy-specific storage APIs.

## 22. API sketch

Names can change during implementation.

```txt
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/today
GET    /api/places
POST   /api/places
GET    /api/places/:id
PUT    /api/places/:id
DELETE /api/places/:id

GET    /api/places/:id/visits
POST   /api/places/:id/visits

GET    /api/visits
GET    /api/visits/:id
PUT    /api/visits/:id
DELETE /api/visits/:id

POST   /api/visits/:id/photos/upload
DELETE /api/photos/:id

GET    /api/settings
PUT    /api/settings
```

`GET /api/today` should be the product-specific endpoint.

Example response:

```json
{
  "weather": {
    "temperatureC": 29,
    "precipitationProbability": 70,
    "condition": "rain"
  },
  "recommendations": [
    {
      "place": {},
      "reasons": [
        "Indoor",
        "Rain expected",
        "Last visited 121 days ago"
      ]
    }
  ]
}
```

The server owns recommendation logic. Do not duplicate it in the client.

## 23. Error behavior

The application must degrade usefully.

Examples:

- weather provider unavailable -> show places with weather scoring omitted
- image store unavailable -> place/visit data still works
- Google Maps URL missing -> place still works
- sparse place metadata -> place can still be recommended
- one photo fails to load -> diary entry still renders

Do not make optional integrations capable of taking down the core app.

## 24. Backups and export

This is personal historical data, so export is more important than sophisticated infrastructure.

Before the diary becomes meaningful, implement a practical backup/export strategy.

At minimum, the system should be able to export:

- places
- visits
- notes
- photo metadata

as JSON.

The local photo directory must be backed up together with the SQLite database.

A future full export may produce a folder containing JSON plus all compressed photos.

Do not let the home server's SQLite database and local photo directory become the only irreversible copy of years of family history.

## 25. Observability

Keep it small.

Useful server logs:

- method
- route
- status
- duration
- selected profile id
- request id

Do not log:

- session token
- password
- password hash
- photo signed URL
- note contents
- exact household/home coordinates

A health endpoint should verify that the application can reach its required storage.

## 26. UI direction

The app should feel like a family tool, not an enterprise admin dashboard.

Important characteristics:

- mobile-first
- large touch targets
- fast to scan
- photos used where helpful
- recommendation reasons visible
- weather visible but not dominant
- minimal typing
- forms reveal optional fields progressively

The Today page is the home screen.

A map view is optional, not the primary interface.

## 27. MVP scope

A first useful version should support the complete planning loop.

### Phase 1 — planning foundation

- authenticated household
- place CRUD
- place browsing/search
- mark a visit
- visit history
- `lastVisitedAt`
- manual planning attributes
- Today recommendation endpoint
- deterministic recency scoring
- deterministic indoor/outdoor scoring
- basic mobile UI

At the end of this phase the app should already answer "what should we do today?" even without external weather.

### Phase 2 — weather

- weather provider
- weather cache
- automatic weather suitability
- recommendation explanations
- household weather thresholds/defaults

### Phase 3 — memories

- visit notes
- local photo storage
- uploads
- private image retrieval
- place photo history
- diary feed

### Phase 4 — quality of life

Only after real usage shows value:

- better filters
- favorites/priority tuning
- time-of-day planning
- seasonal suitability
- opening-hours integration
- automatic distance/drive time
- Google Maps import helpers
- richer photo handling
- PWA/offline support

## 28. Non-goals for v1

Do not build these before the core loop is proven:

- public users
- social features
- public sharing
- comments between users
- general-purpose map replacement
- public reviews
- crawling Google Maps
- AI-generated recommendations
- chat interface
- itinerary planning
- automatic event discovery
- complex calendar integration
- real-time collaborative editing
- native iOS/Android apps
- multiple households
- subscription/billing
- full photo-management system

## 29. Success criteria

The app succeeds if, after it contains a useful number of places:

1. One of the adults can open it and get several credible outing options in seconds.
2. Recently visited places naturally fall down the list.
3. Weather changes the recommendations in an understandable way.
4. Adding a new place takes roughly a minute or less.
5. Recording "we went here today" takes a few seconds.
6. Months later, a place page shows a useful history of when the family went there.
7. Private data is not accessible without authentication.
8. The system remains simple enough for one developer to understand and maintain.

## 30. Open product decisions

The following questions remain intentionally open and should be answered from real household usage rather than speculation.

### Recommendation behavior

1. Should the Today page ask how much time is available, or initially assume the whole remaining day?
2. Should users be able to choose a preferred transport mode for a recommendation session, or should the app always show both drive and train suitability?
3. ~~Should certain places have custom cooldown periods because they become repetitive faster
   than others?~~ **Decided 2026-09-08:** no. `preferredCooldownDays` was removed; one recency
   curve applies to every place.
4. Are there places one adult likes but the other does not, requiring profile-specific preferences later?

### Weather

5. What exact cloud-cover threshold should distinguish "sunny/no clouds" from sufficiently cloudy when temperature is 30°C+?
6. Does light rain rule out normal parks, or should precipitation probability/intensity have multiple levels?
7. Should forecast later in the current day matter, or only conditions around the likely outing time?
8. Are destinations far enough apart that weather should eventually be calculated per place rather than at home?

### Place metadata

9. Which planning attributes actually affect decisions: parking, cost, toilets, food, crowding, nap compatibility, shade, reservation requirement, etc.? Stroller access was tried and removed on 2026-09-08: it never changed a choice.
10. Should restaurants/cafes live in the same database, or is the app specifically about activities/outings?

### Visits and diary

11. Is a star rating useful, or are free-form notes enough?
12. What maximum dimensions/quality should compressed memory photos use?
13. How long should the app retain compressed photos if local storage becomes constrained?

### Public hosting

14. ~~Which public HTTPS ingress should be used for the home server?~~ **Decided 2026-09-07:**
    Tailscale Funnel via a per-app sidecar container. See section 21.
15. Login is IP rate limited (10 attempts / 15 min, `api/auth/guard.ts`), which behind the
    Funnel sidecar depends on `TRUST_PROXY=1` to see real client IPs. Still open: whether a
    single shared household password on a publicly reachable login warrants a second factor
    or temporary lockouts.

## 31. Confirmed defaults

An implementation agent may proceed with these defaults:

- one household
- one shared household login
- two selectable adult profiles
- password login + server-side sessions
- 45-minute normal travel threshold
- store drive time and train time separately
- a place is normally in range if either drive or train time is <= 45 minutes
- typical visit length is recorded in hours, not minutes
- categories are household-owned records chosen from a list, never free text
- deleting a category untags its places rather than being refused
- a place is either active or archived; "want to go" is derived from active and never visited
- no hard post-visit cooldown, and no per-place cooldown override
- never-visited places get only a small boost
- "today" means the current household-local calendar day; default timezone is `Asia/Tokyo`
- 30°C+ with no meaningful cloud cover is too hot for normal outdoor activity
- rain makes normal outdoor-only places unsuitable unless explicitly rain-friendly
- cold alone never excludes outdoor activities
- weather based on the household area, not per destination
- manual drive/train time entry initially
- indoor/outdoor/mixed is required
- most other place metadata is optional
- visits are family-level; no participant tracking
- notes are optional
- photos are compressed memory copies stored on the home server filesystem
- recommendations are deterministic
- React + CSS Modules + esbuild
- Deno + `Deno.serve`
- SQLite behind `api/db/`
- no ORM, no router framework, no state library
- self-hosted home server is the default deployment
- application is publicly reachable over HTTPS
- Tailscale is optional for normal users and retained for administration
- mobile-first UI
- Google Maps remains external navigation

These are defaults, not permanent product commitments.

## 32. Instructions to implementation agents

Before adding a feature, ask:

1. Does this help choose an outing, record an outing, or remember an outing?
2. Can this be implemented without introducing another service or dependency?
3. Is the new data actually useful to recommendation decisions?
4. Does it keep adding a place and recording a visit fast?
5. Does it preserve household privacy?

Prefer explicit code over abstractions created for hypothetical future scale.

Do not convert the project into a generic places platform.

Do not add infrastructure because a large public application would need it. This is a private application for one family.

When a future requirement conflicts with this document, update this document as part of the change so the repository continues to have one clear design contract.
