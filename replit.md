# FigJam workflow workbench

## Current repository boundary

The connected repository arrived with a README describing Figma Librarian, but
none of its application directories. Do not delete or replace the README. The
separate Librarian restoration task owns recovery of that application.
The functioning FigJam workbench is isolated under `workflow_system/`.

## Running and verification

- Run the **FigJam workflow** workflow, or `python -m workflow_system.server`.
- Server binds `0.0.0.0:5000`, serving web UI and same-origin `/api/*`.
- `uv sync --frozen` installs Python dependencies, with no manual virtualenv.
- `python -m unittest discover -s workflow_system/tests -v` checks import,
  dependency execution, errors, retry, cancellation, restart, snapshots, revision,
  validation and HTTP behavior. Test providers are fixtures only, never app fallbacks.
- `scripts/post-merge.sh` is the idempotent post-merge hook.

## Source and execution

The entire first FigJam (`CSXebcFtI1JyEq07xCJ3ko`, node `0:1`) is preserved as
unabridged XML plus a lossless WebP screenshot. The import model has 237 non-connector
elements, 118 original connections and 24 executable stages. Reference/template and
Dutch Facebook mind-map content remain reference material.

Four feedback links are preserved as explicit revision inputs, not blocking
dependencies; automatically running these as ordinary dependencies would create
cycles. Starting a revision is a deliberate user action.

Agents produce reviewable code/specification/documentation artifacts. They have
no external execution/write permissions. Research and test outputs are proposals,
not claims of live web research, verified facts or executed tests.

## Model connection

All model calls go through `workflow_system/provider.py`. No model is simulated.
With no provider configured, inputs and drafts still save, and starting a run
returns a clear blocked state. A full run can issue 24 paid model calls; retries
retain completed stages. In-flight cancelled calls can still cost money.

Recognized server environment settings:
- Replit-managed `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`.
- Otherwise `OPENAI_API_KEY` or `XAI_API_KEY`, optional HTTPS `LLM_BASE_URL`,
  and `LLM_MODEL`.
Use Replit integrations/secrets to configure credentials, never chat or code.
Image inputs require a vision-capable configured model.

## Storage and publication boundary

SQLite data is under ignored `workflow_system/data/`. Inputs (including images),
source snapshots, events, stage outputs and decisions persist across workspace
refresh/restart. Export JSON/Markdown before changing environments. Local workspace
disk is not a managed production database or durable published storage.

This is a single-owner development workbench. It has no application login and
must not be publicly published with private inputs or a paid provider until
access controls and durable production storage are added. No secrets are sent
to the browser. Same-origin writes, payload/image limits, and bounded concurrency
are enforced, but those are not authentication.
