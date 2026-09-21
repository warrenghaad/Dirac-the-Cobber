# Hard-drive reconciliation and shared workspace architecture

Status: proposed control-plane design  
Scope: MacBook Air + Mac mini now; Synology NAS later  
Constraint: the workspace must not live in iCloud Drive

## Decision

Use three distinct systems with distinct authority:

1. **Git/GitHub for code, schemas, policies, and compact text canon.** Each Mac has an independent clone. Git repositories are not bidirectionally file-synced.
2. **A replicated corpus for documents and media.** Until the NAS exists, the Mac mini is the always-on hub and Syncthing replicates approved folders to the MacBook Air. After the NAS is installed, Synology Drive becomes the hub-and-spoke transport. Never run Syncthing and Synology Drive against the same folder.
3. **Independent backups and snapshots.** Time Machine backs up each Mac. The future NAS uses Btrfs snapshots plus a second backup target. Sync is not backup: deletion and corruption can replicate.

The shared root should be `~/StudiOS`, not Desktop, Documents, or any path beneath `~/Library/Mobile Documents`. Keep device-only caches at `~/StudiOS-Local` and repositories at `~/Developer/Trivius`.

If a single external SSD is used before the NAS, attach it to the Mac mini, format its working volume as encrypted APFS, and share it over SMB. A physical disk cannot safely be mounted read/write by two Macs at once. It can be the mini's storage hub, but it must not be the only copy.

## Why Dirac is the correct first control project

Dirac already implements the architectural pattern this work needs:

| Existing Dirac element | Hard-drive role |
|---|---|
| Canonical wireframe manifest | Canonical filesystem policy and catalog schema |
| Librarian classifier | Proposes project, document type, and destination |
| Deterministic plan builder | Converts a reviewed decision into an explicit move/copy plan |
| Validator | Blocks unsafe moves, deletions, path collisions, and policy violations |
| API server | Serves inventory, candidate relationships, decisions, and job status |
| Renderers | Show the conceptual graph and human-review queue |
| `.agents/memory` | Preserves process constraints and known failure traces |
| Empty Drizzle schema | Landing place for inventory and relationship tables after review |

Do not turn Dirac into the storage location for the corpus. Dirac is the **control plane**: rules, manifests, proposed actions, evidence, decisions, and reproducible jobs. The bytes remain in the corpus or archive.

## Recommended filesystem structure

```text
~/StudiOS/                         # replicated corpus; never in iCloud
├── 00_INBOX/                     # append-first intake; no automatic deletion
│   ├── MacBook-Air/
│   ├── Mac-mini/
│   ├── External-Drives/
│   └── Platform-Exports/
├── 10_CANON/                     # approved, current human-facing knowledge
│   ├── System/
│   ├── Projects/
│   ├── Vocabulary/
│   └── Decisions/
├── 20_PROJECT-MATERIALS/         # non-code working files grouped by project ID
│   ├── Active/
│   ├── Incubating/
│   └── Completed/
├── 30_RESEARCH/                  # sources, notes, excerpts, bibliographies
├── 40_MEDIA/                     # image, audio, video, design exports
│   ├── Masters/
│   ├── Derivatives/
│   └── Proxies/
├── 50_DATA/                      # machine-readable outputs, not application caches
│   ├── Catalog/
│   ├── Exports/
│   ├── Schemas/
│   └── Indexes/
├── 60_AUTOMATION/                # shared configuration and readable job records
│   ├── Policies/
│   ├── Job-Plans/
│   └── Reports/
├── 70_ARCHIVE/                   # retained but inactive, read-mostly
├── 80_QUARANTINE/                # reversible holding zones
│   ├── Exact-Duplicates/
│   ├── Near-Duplicates/
│   ├── Sync-Conflicts/
│   └── Unclassified/
└── 99_SYSTEM-MAP/                # pointers, IDs, maps; no secrets or raw databases

~/Developer/Trivius/              # one independent Git clone per Mac
└── Dirac-the-Cobber/

~/StudiOS-Local/                  # never synced
├── Cache/
├── Build/
├── Derived-Indexes/
└── Temporary/
```

Folder numbers express custody state, not subject taxonomy. Subject and project membership belong in the catalog as relationships, so one document can belong to multiple concepts without being duplicated into multiple folders.

## Storage authority matrix

| Material | Working authority | Replication | Version history | Backup |
|---|---|---|---|---|
| Code, schemas, policies | Git repository | GitHub push/pull | Git commits and tags | Time Machine + Git remote |
| Canonical documents | `~/StudiOS/10_CANON` | Syncthing now; Synology Drive later | Sync versioning plus decisions ledger | Time Machine; NAS snapshots later |
| Research and project files | `~/StudiOS/20–40` | Selective replication | Catalog observations | Time Machine; NAS snapshots later |
| Large masters | mini/external SSD now; NAS later | Air on demand or not at all | Immutable master + derived edges | NAS plus second target |
| Inventory metadata | local SQLite first; Postgres/Supabase after schema approval | Database replication/export | append-only observations and decisions | DB backups + CSV/JSON export |
| Build output and caches | `~/StudiOS-Local` | none | none | generally excluded |

## Semi-automated reconciliation pass

The first pass must be observational. It produces evidence and proposed actions; it does not delete, overwrite, rename, or merge files.

### Phase 0 — establish a safety baseline

- Verify at least one readable backup of every source volume.
- Record device, volume UUID, filesystem, capacity, and mount point.
- Freeze bulk reorganizing while the baseline scan runs.
- Assign every source an ID and place new material only into its named inbox.
- Exclude iCloud-controlled paths, Time Machine stores, application bundles, caches, dependency trees, and virtual-machine images by explicit policy.

### Phase 1 — immutable inventory

Create one observation per path with at least:

`observation_id, device_id, volume_id, path, parent_path, filename, extension, byte_size, created_at, modified_at, inode, uti_or_mime, sha256, scan_id, observed_at`

Separate a **file object** (content identity) from a **path observation** (where and when that content was seen). This prevents a rename from looking like a new file and lets one exact file have multiple paths.

Outputs:

- `inventory.csv`
- `scan-summary.json`
- `errors.csv`
- an append-only scan ledger

### Phase 2 — exact duplicates

Group by byte size, then hash candidates, then optionally verify byte-for-byte. `rmlint` is a strong report generator because it supports several hashes, byte comparison, machine-readable outputs, very large file sets, and incremental scans. Use its output only as evidence; do not replay its deletion script during the audit.

For every exact-duplicate set, compute a proposed canonical copy using explicit criteria:

1. approved project/canon path;
2. richest metadata and extended attributes;
3. most trustworthy creation/modification history;
4. path with the clearest provenance;
5. no preference based only on filename such as `final-final-2`.

All noncanonical candidates go to a review queue. If approved, move them to `80_QUARANTINE/Exact-Duplicates/<group-id>/`, record the old and new paths, and retain them through a defined waiting period before any deletion.

### Phase 3 — near duplicates

Use type-specific evidence rather than one universal similarity score:

- Images: perceptual hash plus dimensions, capture time, and EXIF; Czkawka can report similar images and videos.
- Audio/video: duration, codec, waveform/fingerprint or frame sampling.
- Text/PDF/office files: extracted normalized text, shingled similarity, and revision markers.
- Source code: language-aware normalized text; never auto-merge repositories.
- Names and paths: token similarity as weak evidence only.

Every candidate relationship stores the method, tool version, parameters, score, and evidence. Near duplicates are never automatically deleted.

### Phase 4 — subject overlap with distinct information

Chunk extracted text locally, retain source anchors, and compare embeddings only after exact and near-duplicate processing. Store the embedding model and version with every vector. Supabase/Postgres with `pgvector` is appropriate for relationship search, but the first implementation should keep raw file bytes local and upload only approved metadata, excerpts, or vectors. A similarity hit is a candidate `SUBJECT_OVERLAP` edge, not a merge instruction.

### Phase 5 — Librarian recommendation and human decision

The Dirac Librarian proposes:

- project/concept IDs;
- document role (`source`, `canon`, `draft`, `artifact`, `export`, `archive`);
- destination zone;
- relationships to other file objects;
- confidence and evidence.

The human chooses `accept`, `modify`, `defer`, or `reject`. Only accepted decisions become an executable job plan. The validator blocks any plan lacking a verified source hash, destination collision rule, rollback location, and audit record.

### Phase 6 — reversible enactment

Execute one bounded batch at a time:

1. verify current source hash;
2. copy to destination staging;
3. verify destination hash;
4. atomically promote or move;
5. write event and rollback record;
6. quarantine the redundant source when approved;
7. re-scan the affected paths.

No `rm`, empty-trash, or permanent duplicate cleanup belongs in the first implementation.

## Continuous update design

Every Mac uses the same logical paths and policy version, but not the same transport for every class of data:

- `~/Developer/Trivius`: Git only. Work on a branch, commit, push, then pull on the other Mac. Do not file-sync `.git` directories.
- `~/StudiOS/10_CANON` through `60_AUTOMATION`: two-way file sync, with versioning and conflict quarantine.
- `~/StudiOS/40_MEDIA/Masters`: mini/NAS authoritative; Air selective or receive-only when possible.
- `~/StudiOS/70_ARCHIVE`: read-mostly and preferably receive-only on the Air.
- `~/StudiOS/80_QUARANTINE`: mini/NAS authoritative; do not let cleanup utilities watch it.
- `~/StudiOS-Local`: excluded everywhere.

Before the NAS, use Syncthing with the Mac mini as the always-on full-copy node and enable staggered versioning on the mini. Syncthing's own documentation warns that synchronization is not an ideal backup because changes and deletions propagate, so Time Machine remains separate.

After the NAS arrives:

1. Create Btrfs shared folders matching the custody zones.
2. Make Synology Drive the single sync hub for the corpus.
3. Enable snapshots with a retention policy before enabling broad two-way sync.
4. Give each Mac a separate Time Machine destination over SMB.
5. Add a second, physically independent NAS/offsite backup. RAID and snapshots are not that second copy.
6. Retire Syncthing from corpus folders only after a hash-verified migration and conflict review.

## Backend increments in Dirac

Preserve the existing repository structure rather than performing an early rewrite:

```text
docs/hard-drive-reconciliation/       # policy, system map, layout manifest
lib/file-catalog/                     # file/path/scan/event domain logic
lib/reconciliation/                   # exact, near, and semantic candidates
lib/policy-validator/                 # no-delete and path/collision invariants
lib/db/src/schema/                    # reviewed Drizzle tables
artifacts/api-server/src/routes/      # inventory, candidates, decisions, jobs
artifacts/wireframe-library/          # graph/review renderer using plan JSON
scripts/inventory/                    # scanners and export adapters
```

The first software slice should stop after scan + exact-duplicate reporting. It should run against a deliberately small test folder before any whole-drive scan.

## Minimum acceptance tests

- A file renamed between scans keeps the same `file_object_id` and gains a new path observation.
- Two byte-identical files form one exact group without either being deleted.
- Similar images remain distinct objects linked by evidence.
- A document may belong to multiple project/concept IDs without another physical copy.
- A plan fails validation if a destination exists and no collision policy is supplied.
- A plan fails validation if rollback or quarantine is absent.
- Sync conflict copies are indexed and routed to review, never silently preferred.
- Git repositories remain functional on both Macs after corpus synchronization.
- No managed path resolves inside iCloud Drive.

## Sources checked on 2026-09-21

- Apple, [Disk Utility User Guide](https://support.apple.com/en-tm/guide/disk-utility/dsku3d60eefc/mac): APFS volumes and encrypted external storage.
- Apple, [Backup disks you can use with Time Machine](https://support.apple.com/en-us/102423): external disks, Mac shares, and SMB-capable NAS destinations.
- Apple, [Desktop and Documents in iCloud Drive](https://support.apple.com/en-us/109344): those folders become iCloud-managed when enabled; third-party sync should use another home-folder location.
- Syncthing, [FAQ](https://docs.syncthing.net/users/faq.html): peer synchronization behavior, conflict risks, and the explicit warning that sync is not backup.
- Syncthing, [File Versioning](https://docs.syncthing.net/users/versioning): per-folder version strategies and their limits.
- Synology, [Synology Drive Client](https://kb.synology.com/en-us/DSM/help/SynologyDriveClient/synologydriveclient?version=7) and [computer/NAS sync guide](https://kb.synology.com/en-us/DSM/tutorial/How_to_sync_files_between_Synology_NAS_and_your_computer_using_Drive_desktop): future hub-and-spoke sync.
- Synology, [Snapshot Replication](https://kb.synology.com/en-us/DSM/help/SnapshotReplication/snapshots?version=7): future snapshot layer.
- GitHub, [Managing large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files): Git LFS exists for large tracked assets; the bulk corpus should not be treated as a normal Git repository.
- rmlint, [User manual](https://rmlint.readthedocs.io/en/master/): exact duplicate detection, output formats, incremental scans, and cautions.
- Czkawka, [Core overview](https://github.com/qarmin/czkawka/blob/master/czkawka_core/README.md): exact and similar image/video scanning capabilities.
- Supabase, [pgvector extension](https://supabase.com/docs/guides/database/extensions/pgvector): vector similarity storage and queries for candidate subject-overlap edges.

