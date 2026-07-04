# SDLC End-to-End Pipeline — Demo & Orchestrator

One pipeline from **requirements document → built app → user stories → test cases →
automation scripts → test data → test run → bug report**, orchestrated by Claude Code
skills. This repository contains both the orchestrator skill definition and a complete,
already-executed demo run you can replay locally in under a minute.

---

## 1. What This Is

Two skill packs exist as building blocks:

1. **CI/CD pack** (`deploy`, `detect-stack`, `generate-dockerfile`, `unit-test-generator`,
   `generate-pipeline`, `setup-git-hooks`, `pre-push-vuln-scan`, `create-deploy-jira-story`)
   — onboards an app repo to Azure DevOps CI/CD, deploying to a shared AKS cluster.
2. **QA pack** (`qa-pipeline`, `app-scaffolding`, `jira-story-writer`, `test-case-generator`,
   `playwright-dotnet-scripts`, `test-data-generator`, `test-runner-bug-reporter`)
   — builds an app from requirements and QA-tests it end to end.

**`SKILL-sdlc-e2e-orchestrator.md`** (in this folder) chains both packs into one flow:

```
requirements doc
   → PHASE A  BUILD    app-scaffolding: app code + assumptions + traceability
   → PHASE B  DEPLOY   cc run deploy --init: Dockerfile, unit tests, pipeline, AKS
   → PHASE C  QA       stories → test cases → scripts → data → run → bugs
```

Key wiring: the deployed app URL from Phase B becomes the test target in Phase C;
Phase A's requirements extraction feeds story writing; the `/health` endpoint gates
the E2E run until deploy completes. Full details, handoff map, and conflict
resolutions are inside the orchestrator SKILL file.

---

## 2. What The Demo Run Did (already executed, artifacts committed here)

Input was `docs/requirements.md` — a small Task Manager API (create task with
validation, list newest-first, complete task, health endpoint).

| Stage | Skill it demonstrates | Artifact produced |
|---|---|---|
| A1 Build | app-scaffolding | `app/server.js` (zero-dependency Node API), `app/assumptions.md`, `app/requirements-traceability.md` |
| B Deploy | deploy --init | **Skipped** — needs org ADO/ACR/AKS access; app runs locally instead |
| C1 Stories | jira-story-writer | `qa/stories/stories.md` — 4 stories (PROJ-101..104) with Gherkin acceptance criteria |
| C2 Test cases | test-case-generator | `qa/test-cases/test-cases.json` — 8 cases: 4 positive, 2 negative, 2 boundary (C1001..C1008) |
| C3 Scripts | playwright-dotnet-scripts | `qa/e2e/tasks.e2e.test.js` — one test per case, tagged `@TestRail-C#### @PROJ-###` |
| C4 Test data | test-data-generator | `qa/test-data/fixtures.json` — 5 named sets, boundary lengths programmatically exact (100/101 chars) |
| C5 Run + report | test-runner-bug-reporter | `qa/reports/test-run-report.md` — **8/8 pass**, raw output in `run-output.txt` |

State carried between stages lives in `sdlc-manifest.md` — the traceability chain is
requirement ID → story → AC scenario → test case → test tag → (bug, if any failure).

Substitutions made for a local machine (each marked in the files):

- **Jira / TestRail push → local files** (no connectors in the demo session; content
  is identical to what would be pushed).
- **Playwright .NET → `node:test` + fetch** (no dotnet installed; same coverage and
  tags — regenerate as C# via the `playwright-dotnet-scripts` skill when a .NET
  toolchain exists).
- **AKS URL → `http://localhost:3210`** (Phase B skipped).

---

## 3. Setup & Run

### Prerequisite

Node.js ≥ 18 (`node --version`). Nothing else — the app and tests use only the
standard library, zero `npm install`.

### Replay the test run (app starts and stops automatically)

```bash
cd sdlc-demo
node --test qa/e2e/tasks.e2e.test.js
```

Expected: `# tests 8` / `# pass 8`. The suite spawns the app, polls `/health` until
ready, runs all 8 cases, kills the app.

### Run the app standalone

```bash
node app/server.js          # listens on :3210 (override with PORT=)

curl http://localhost:3210/health
curl -X POST http://localhost:3210/tasks -d '{"title":"my first task"}'
curl http://localhost:3210/tasks
curl -X POST http://localhost:3210/tasks/1/complete
```

### Install the skills (orchestrator + both packs)

All 16 skill folders ship in this repo under `skills/`, already in Claude Code convention
(one folder per skill, `SKILL.md` inside). Install everything flat:

```bash
mkdir -p ~/.claude/skills
cp -R skills/cicd-pack/*/ skills/qa-pack/*/ skills/sdlc-e2e-orchestrator ~/.claude/skills/
```

Then in any Claude Code session: *"run the SDLC pipeline end to end on this
requirements doc"*. Notes:

- Phase B additionally needs the org's Azure DevOps / ACR / AKS access and the
  DevOps-committed `config.yml` + `.azure/pipeline-entry.yml`. Without them, skip
  Phase B and test against a locally-run app — exactly what this demo does.
- Jira and TestRail pushes need their MCP connectors; otherwise stories/cases are
  written as local files (as here).

---

## 4. Repository Layout

```
sdlc-demo/
├─ README.md                          ← this file
├─ skills/                            ← all 16 skills, Claude Code convention
│  ├─ sdlc-e2e-orchestrator/SKILL.md  ← the connector — chains both packs
│  ├─ cicd-pack/                      ← pack 1: Azure DevOps CI/CD (8 skills)
│  │  ├─ deploy/  detect-stack/  generate-dockerfile/  generate-pipeline/
│  │  ├─ unit-test-generator/  setup-git-hooks/  pre-push-vuln-scan/
│  │  └─ generate-jira-userstory/
│  └─ qa-pack/                        ← pack 2: QA automation (7 skills)
│     ├─ qa-pipeline/  app-scaffolding/  jira-story-writer/
│     ├─ test-case-generator/  playwright-dotnet-scripts/
│     └─ test-data-generator/  test-runner-bug-reporter/
├─ sdlc-manifest.md                   ← pipeline state/log for the demo run
├─ docs/
│  └─ requirements.md                 ← pipeline input (FR-1..FR-4)
├─ app/                               ← Phase A output
│  ├─ server.js
│  ├─ assumptions.md
│  └─ requirements-traceability.md
└─ qa/                                ← Phase C output
   ├─ stories/stories.md
   ├─ test-cases/test-cases.json
   ├─ test-data/fixtures.json
   ├─ e2e/tasks.e2e.test.js
   └─ reports/
      ├─ test-run-report.md
      └─ run-output.txt
```

---

## 5. What You Would Do With This

- **Share / review** — the artifacts show the full method: how requirements become
  traceable stories, how AC scenarios become typed test cases, how cases become
  tagged automation, and how a run maps failures back to cases for bug filing.
- **Replay** — one command (section 3) proves the whole chain executes.
- **Extend** — replace `docs/requirements.md` with a real requirements doc and rerun
  the pipeline via the orchestrator skill; every downstream artifact regenerates from it.
- **Go to production** — connect Jira + TestRail MCP, install a .NET toolchain for
  real Playwright scripts, and grant ADO/AKS access to activate Phase B. The flow and
  artifacts stay the same; only the destinations change (local files → Jira/TestRail,
  localhost → AKS URL).
