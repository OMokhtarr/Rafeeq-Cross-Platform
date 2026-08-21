# Content Sync — verified wire format

Date: 2026-08-21
Status: Verified against the live API (`apis.quran.foundation`) with production
credentials via the token broker.

Companion to `2026-08-21-content-sync-design.md`, which was written from the
prose documentation before any response body had been seen. **Where the two
disagree, this file is correct.**

## Endpoints

Both are relative to `https://apis.quran.foundation/content/api/v4` and take the
same auth headers the existing client already sends (`authorization: Bearer`,
`x-auth-token`, `x-client-id`).

```
GET /resources/sync?bootstrap=true&resources=<filter>&per_page=<n>
GET /resources/sync?sync_token=<token>&resources=<filter>&per_page=<n>
GET /resources/snapshots/{group}/{id}
```

## Corrections to the design doc

Five inferred details were wrong.

### 1. Responses are wrapped in a `sync` envelope

Not top-level as assumed:

```json
{ "sync": { "sync_until_sequence": 1395, "has_more": false,
            "next_page_url": null, "next_sync_token": "…", "mutations": [ … ] } }
```

### 2. `resources` is required

Omitting it is a `422`, not an unfiltered sync:

```json
{"details":{"error":{"code":"missing_resources","message":"resources is required"}},
 "type":"unprocessable_entity","success":false}
```

There is therefore **no way to ask "what changed across everything"** — the app
must always name the resources it holds. This makes the persisted
`trackedResources` list load-bearing rather than merely convenient: it is the
only record of what to ask about.

### 3. An unknown *group* is a 422; an unknown *id* is a silent empty result

```
bogus:1        → 422 unknown_resource_group
tafsirs:99999  → 200, mutations: []
```

A typo'd id is indistinguishable from a resource with no pending changes. The
engine cannot use "empty mutations" to detect a bad id.

### 4. `snapshot_url` is a relative path, and not relative to the API base

It comes back as `/api/v4/resources/snapshots/tafsirs/169` while the base path is
`/content/api/v4`. Resolving it naively against the base yields a 404. It must be
rewritten:

```
origin + snapshot_url.replace(/^\/api\/v4/, "/content/api/v4")
```

### 5. Bootstrap does NOT emit a `RESOURCE_CREATE` for every resource

This is the one that changes the design.

| Query | Mutations |
|---|---|
| `tafsirs:169` | 1 × `RESOURCE_CREATE` |
| `tafsirs:15` | 1 × `RESOURCE_CREATE` |
| `tafsirs:16` | **0** |
| `tafsirs:926` | **0** |
| `recitations:1,2,7,12` | **0** (all) |

Yet **every one of those resources has a full snapshot**:

```
recitations/{1,2,3,4,5,6,7,8,9,10,11,12}  → 200, 6236 records each  (12/12)
tafsirs/16   → 200, 5278 records
tafsirs/169  → 200, 6236 records
tafsirs/15   → 200, 6196 records
tafsirs/926  → 200, 6236 records
```

So empty mutations means "nothing changed since the server's baseline", **not**
"unsupported" and **not** "no content". Bootstrap is a change feed, not a
content feed.

**Consequence:** a bootstrap that returns no mutations must still fetch the
snapshot directly, or the resource is tracked while holding zero rows —
violating the `tracked ⟺ rows on disk` invariant, and leaving tafsir permanently
blank offline for most resources. `bootstrapResource()` must call
`/resources/snapshots/{group}/{id}` unconditionally and treat the sync feed as
the *incremental* path only.

## Mutation shape (verified)

```json
{
  "sequence": 1234,
  "type": "RESOURCE_CREATE",
  "resource_group": "tafsirs",
  "resource_id": 169,
  "resource_content_id": 4321,
  "record_type": null,
  "record_key": null,
  "source_record_id": null,
  "changed_at": "2026-08-21T08:16:39Z",
  "data": null,
  "snapshot_url": "/api/v4/resources/snapshots/tafsirs/169",
  "unavailable_reason": null
}
```

`record_type` / `record_key` / `data` are null on RESOURCE-level mutations and
are presumably populated on ROW-level ones — **no ROW mutation was observed**, so
their exact shape remains unverified. Keep them isolated in `parseMutation`.

Two fields the design doc did not know about: `resource_content_id` (a content
revision id, distinct from `resource_id`) and `unavailable_reason`.

## Snapshot shape (verified)

```json
{ "resource_group": "tafsirs", "resource_id": 169, "resource_content_id": …,
  "schema_version": 1, "sync_sequence": …, "records": [ … ] }
```

`schema_version` and `sync_sequence` were not anticipated. `sync_sequence` is
the snapshot's position in the same sequence space as mutations — it is what
lets a snapshot fetch and the mutation feed be reconciled without double-applying.

### Tafsir record

Carries `verse_key` (`"1:1"`), `text` (HTML), `updated_at`, and grouping fields
(`group_verse_key_from` / `_to`, `group_verses_count`) — tafsir entries can span
a verse *range*, so a single record may cover several verses. The read adapter
must expand ranges, not assume one record per verse.

### Recitation record

```
recitation_id, verse_key, url ("Alafasy/mp3/001001.mp3"), duration,
format ("mp3"), mime_type, segments [[i, from, to, …], …],
record_type: "audio_file", updated_at
```

`url` is a **relative CDN path**, and `segments` are word-level timings. Note
this is real playback data, not just an eviction index — it overlaps with what
`fetchAudioForAyah` and the timestamp endpoint provide today.

## Payload sizes (measured)

| Resource | Bytes | ~MB |
|---|---|---|
| `recitations/7` snapshot | 3,944,752 | 3.8 |
| `tafsirs/169` snapshot | 12,421,395 | 11.8 |

A tafsir snapshot is ~12 MB in a single response with no pagination on the
snapshot endpoint. Bootstrap must stream/parse this without blocking the UI, and
progress reporting is not optional. The design doc's "tens of MB" estimate for
tafsir was right; the per-request granularity (all-or-nothing) was not
anticipated.

## Still unverified

- **ROW-level mutations** — none observed. `record_type`, `record_key`, and
  `data` shapes are still inferred.
- **`sync_token` expiry** — undocumented and untested. The design's "treat 4xx on
  incremental as re-bootstrap" remains the right defensive stance.
- **Pagination** — every observed response had `has_more: false` and
  `next_page_url: null`. The multi-page path is untested.

## Reproducing

Probe scripts live in the session scratchpad (throwaway, not committed). They
read `.env.local` and go through the token broker, so no secret is ever handled
directly.
