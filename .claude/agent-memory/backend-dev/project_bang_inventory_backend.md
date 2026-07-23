---
name: project-bang-inventory-backend
description: Layout, layering, and workflow-engine architecture conventions for the bang-inventory Go backend at /Users/vikasraj/project/theBH/bang-inventory
metadata:
  type: project
---

The backend lives at `/Users/vikasraj/project/theBH/bang-inventory` (separate repo from this
frontend one) — Go + Gin + sqlx (MySQL), layered `internal/{models,repository,service,handler}` +
`internal/router/router.go` + `internal/constants` + `internal/middleware`. Response envelope is
`{"success":true,"data":{...}}` / `{"success":false,"error":"..."}` via `responses/responses.go`
helpers (`responses.OK`, `responses.NotFound`, `responses.BadRequest`, `responses.Created`, etc).

**CLAUDE.md automation**: any edit under `internal/`, `cmd/`, `responses/`, `migrations/` requires
invoking the `doc-guider` agent afterward to update `docs/DESIGN.md` (bump version suffix + date).
New/changed endpoints, RBAC rule changes, new webhook events, or validation rule changes also
require `doc-guider` on `docs/UI_GUIDE.md`. After any non-trivial feature, run the
`review-pipeline` agent (db-architect + code-reviewer + perf-safety-reviewer in parallel, then
doc-guider if endpoints changed) — this is explicitly requested by the project's own CLAUDE.md, not
optional discretion.

**Workflow engine (v1, added mid-2026)**: replaced a hardcoded 6-step lot pipeline with a generic
node/edge graph engine. Key files: `internal/service/workflow_service.go` (runtime: instance
lifecycle, node start/complete/skip/decide, advance/branch resolution),
`internal/service/workflow_template_service.go` (authoring: template/version CRUD, save-graph,
publish, graph validation `validateGraphShape`), `internal/repository/workflow_repo.go`,
`internal/models/workflow.go`.

Core invariants worth knowing before touching this code:
- A `workflow_node_instances` row only ever exists for a node the instance has visited OR is
  currently sitting at — nothing pre-inserts rows for unvisited future nodes. A row can only be
  `pending`/`in_progress` if it's the single current node (enforced by construction, not a DB
  constraint) — see `GetLotWorkflowDetail`'s doc comment in workflow_service.go for the full
  reasoning. This is why a "full graph with not-yet-reached nodes shown" feature needs a
  service-layer merge against the *template's* full node list, not just `ListNodeInstances`.
- Graphs are validated (`validateGraphShape`) to have no cycles, exactly one entry point, every
  node reachable, and node-type-specific outgoing-edge shape rules — safe to assume DAG-shaped
  when writing new read paths (e.g. safe to key node instances by `NodeID` in a map, at most one
  instance row per node per run).
- `WorkflowNode`/`WorkflowNodeInstance`/`WorkflowEdge` are the model building blocks; reuse them
  directly (embed/alias) rather than inventing parallel DTOs when adding new read endpoints — this
  codebase's existing convention (`WorkflowTemplateDetail` embeds `WorkflowTemplateVersion` this
  way).
- `GetNodesByVersion`/`GetEdgesByVersion` (repo) load a template version's full graph — same calls
  `WorkflowTemplateService.GetTemplateDetail` uses for the canvas editor. sqlx leaves a nil slice on
  zero rows; normalize to `[]` before returning JSON (documented in `GetTemplateDetail`'s comment)
  so frontend `.map()` calls don't need null-checks.
- Synthetic/frontend-only status values (e.g. a "not_started" status for a template node with no
  instance row yet) should NOT be added to `constants.WorkflowNodeStatus*` — those name real
  `workflow_node_instances.status` column values only. Define synthetic ones as a separate const
  near the model that uses them, with a comment explaining why it's not in `constants`.

Lot routes are registered twice in router.go (`/steps/:nodeKey/...` legacy alias +
`/nodes/:nodeKey/...` new path) pointing at the same handler — a deliberate frontend-migration
pattern, not duplication to clean up.

See [[feedback_verification_workflow]] for how to spin up and verify against a live instance of
this backend without disturbing the user's own running server.
