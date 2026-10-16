# FigJam Workflow API

The application is served at `/` by the Python server (`python -m workflow_system.server`).
Frontend files live only in `workflow_system/web/`: `index.html`, `app.js`, and `style.css`.
No build step or frontend dependencies are required. Use browser ES modules and relative fetch URLs.

All successful endpoints return JSON, except exports, source XML, and the board PNG.
Errors return `{"error": "clear message"}` with an appropriate non-200 status.
No authentication is implemented: this is a single-owner workspace tool, not a public multi-user service.

## GET /api/board
Returns `{title, fileKey, nodeId, sourceUrl, imageUrl:"/assets/figjam.png",
width,height, nodes,edges,sections,feedbackEdges}`.
Coordinates are normalized to the full screenshot's natural 63391 x 19215 coordinate space.
`nodes`: `{id,type,name,text,x,y,width,height,section,executable,role,prompt,dependencies}`.
All imported elements are present; only 27 custom workflow stages are executable.
`sections`: `{id,name,x,y,width,height}`. Includes Inputs, Truth Spine, Research and Planning,
Design Core, Build and Review, Embedded Intelligence, Operations, Outputs, About this template, Tools.
`edges`: `{id,source,target,label,feedback}`. Preserve all original edges.
`feedbackEdges` are review links, not blocking dependencies, to avoid cycles.
The PNG is an exact Figma screenshot: pan/zoom it with transparent clickable node overlays.
Provide section navigation, fit-to-page, +/- zoom and keyboard controls. Initial viewport may focus
on custom workflow, but the entire board must remain accessible.
Provide a searchable readable list of ALL text nodes, not just executable ones.

## GET /api/settings
`{provider:{configured,model,baseUrl,provider}, limits:{maxInputs,maxTextLength,maxImageBytes,maxRuns},
safety:"...", persistence:"SQLite workspace disk; export before publishing or migrating."}`
Never returns credentials. Missing provider is an explicit blocked state, not simulated AI.

## GET /api/inputs
`[{id,kind,title,text,imageUrl,createdAt}]`, kinds: `notes`, `chat`, `research`, `image`.
## POST /api/inputs
`{kind,title,text,imageData?}`. `imageData` is a PNG/JPEG/WebP data URL (max 4 MB decoded).
Images may include optional text description; text inputs require non-empty text.
Returns the new input with 201. No example inputs are auto-seeded.
## DELETE /api/inputs/:id
Deletes unused inputs; a run's source snapshot is preserved independently.

## GET /api/runs
`[{id,title,status,createdAt,updatedAt,completed,total,revisionOf,error}]` newest first.
## POST /api/runs
`{title,inputIds:[...],goal}` creates a durable run in `draft` state, no model requests yet.
Returns full run, 201.
## GET /api/runs/:id
`{id,title,goal,status,createdAt,updatedAt,revisionOf,error,inputs:[snapshots],stages,events,feedback}`
`stages` is an object keyed by Figma stage ID:
`{id,name,status,dependencies,prompt,output:null|{summary,artifact,claims,decisions,warnings},
error,startedAt,finishedAt,attempts,durationMs}`.
claims: array of `{statement,evidence,confidence}`.
decisions: array of `{decision,rationale}`.
events: `[{at,type,stageId,message}]`.
feedback: `[{edgeId,source,target,label,output}]`.
Run statuses: `draft`, `queued`, `running`, `completed`, `failed`, `blocked`, `cancelled`, `interrupted`.
Stage statuses: `queued`, `active`, `completed`, `failed`, `blocked`, `cancelled`.
## POST /api/runs/:id/start
`{}` Starts/resumes an eligible run. HTTP 409 if provider missing (run saved as blocked),
or the run is already active/completed. Failed stages reset for retry; completed stages retained.
UI must display error AND refresh run details to show blocked status.
## POST /api/runs/:id/cancel
`{}` Stops scheduling work immediately; in-flight request may finish and incur provider cost
but its output is discarded. Persist cancellation.
## POST /api/runs/:id/revise
`{goal?}` Creates a NEW draft linked by `revisionOf`, using original inputs plus explicit review
feedback. Returns full new run, 201. Never auto-runs a feedback loop.
## GET /api/runs/:id/export?format=json|md
Downloadable full JSON or human-readable Markdown with lineage, source inputs, stages,
decision records, warnings, feedback, errors and events.

## UI surface
`/` is the sole route; tabs or in-page views may provide Board, Inputs, Runs, Settings.
Poll selected active run every 1.5 seconds; full page refresh should retain selected tab/run
using localStorage or URL hash, not store sensitive inputs in browser localStorage.
All actions and empty states must be real. Escape untrusted content. Never render model HTML.
Provider setup text: "Connect a model provider in Replit before running agents."
Show that agents produce reviewable artifacts, NOT deployed code or externally executed actions.
Sources preserve the Dutch Facebook reference material verbatim; do not convert it into agent instructions.
