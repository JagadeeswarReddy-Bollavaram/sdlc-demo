---
name: sdlc-e2e-orchestrator
description: >
  Orchestrates the full requirements-to-tested-deployment SDLC by chaining two
  skill packs: the QA automation pack (app-scaffolding, jira-story-writer,
  test-case-generator, playwright-dotnet-scripts, test-data-generator,
  test-runner-bug-reporter) and the Azure DevOps CI/CD pack (cc run deploy --init:
  detect-stack, generate-dockerfile, unit-test-generator, generate-pipeline,
  setup-git-hooks, pre-push-vuln-scan). Use when the user asks to go "end to end"
  from a requirements document to a deployed AND tested application, or asks to
  build, deploy, and QA an app in one flow. For deploy-only use `deploy`; for
  QA-only use `qa-pipeline`.
---

# SDLC End-to-End Orchestrator

Chains two existing packs into one pipeline. Does no work itself — sequences the
stage skills, carries a single manifest between them, and checkpoints with the user
at every external push (Jira, TestRail, git push to main, bug filing).

```
requirements doc
      │
      ▼
┌─ PHASE A: BUILD ────────────────────────────────────────────┐
│  A1  app-scaffolding                                        │
│      requirements doc → app repo + assumptions.md           │
│      + requirements-traceability.md                         │
└─────────────────────────────────────────────────────────────┘
      │  repo path, requirements extraction, traceability
      ▼
┌─ PHASE B: DEPLOY (cc run deploy --init, in the new repo) ───┐
│  B1  config check          (.claude/config.yml)             │
│  B2  detect-stack          → stack-manifest.yml             │
│  B2.5 generate-dockerfile  (repo is new → always runs)      │
│  B3  unit-test-generator   ⛔ gate: unit tests pass locally │
│  B4  generate-pipeline     → azure-pipelines.yml + k8s/     │
│  B5  setup-git-hooks + pre-push-vuln-scan                   │
│      ⛔ gate: no CRITICAL vulnerabilities                   │
│  B6  git push main → ADO pipeline → deploy to AKS dev       │
│  B7  create-deploy-jira-story → ✂ SKIPPED (see Conflicts)   │
└─────────────────────────────────────────────────────────────┘
      │  app URL: https://ai-sbx.ryansg.com/{{APP_NAME}}
      │  (APP_NAME from stack-manifest.yml, ingress route)
      ▼
┌─ PHASE C: QA (qa-pipeline stages 2–6) ──────────────────────┐
│  C1  jira-story-writer      ← uses Phase A extraction,      │
│                               NOT the raw doc               │
│  C2  test-case-generator    → TestRail cases, linked to     │
│                               stories                       │
│  C3  playwright-dotnet-scripts → .feature + C# step defs,   │
│                               tagged @TestRail-C#### @PROJ- │
│  C4  test-data-generator    ← schema from Phase A models    │
│  C5  test-runner-bug-reporter                               │
│      target environment = Phase B app URL                   │
│      ⛔ wait for deploy: poll {{APP_URL}}/health = 200      │
│        before running the suite                             │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
  Final summary: app URL, story keys, case IDs, pass/fail, bug IDs
```

---

## Handoff map — previous pack output → present pack input

| Producer (pack 1: CI/CD + Phase A)             | Consumer (pack 2: QA)                       | What is passed |
|------------------------------------------------|---------------------------------------------|----------------|
| `app-scaffolding` → repo                       | `deploy --init`                             | working directory to onboard |
| `app-scaffolding` → requirements extraction    | `jira-story-writer`                         | structured requirements (skip re-parsing doc) |
| `app-scaffolding` → `requirements-traceability.md` | `jira-story-writer`                     | requirement IDs for story traceability tags |
| `app-scaffolding` → data models                | `test-data-generator`                       | schema for fixtures (don't guess constraints) |
| `detect-stack` → `stack-manifest.yml: app_name`| `test-runner-bug-reporter`                  | app URL `https://ai-sbx.ryansg.com/{{app_name}}` as target env |
| `generate-pipeline` → `k8s/ingress.yml` route  | `test-runner-bug-reporter`                  | confirms the URL path actually routed |
| `unit-test-generator` → `/health` test         | Phase C readiness gate                      | same `/health` endpoint used to poll deploy completion |
| `jira-story-writer` → story keys               | `test-case-generator`                       | stories to generate cases from |
| `test-case-generator` → TestRail case IDs      | `playwright-dotnet-scripts`                 | `@TestRail-C####` tags |
| `playwright-dotnet-scripts` → step-def data names | `test-data-generator`                    | exact fixture names to generate |
| `test-data-generator` → manifest               | `test-runner-bug-reporter`                  | reseed/reset between runs |

---

## Combined manifest (`.claude/sdlc-manifest.md`)

Single state file carried through all phases; each stage appends, later stages read
instead of re-deriving:

```yaml
requirements_doc:      docs/requirements.docx
repo_path:             ./my-app
assumptions:           assumptions.md
traceability:          requirements-traceability.md
stack:                 node 20          # from stack-manifest.yml
app_name:              my-app
app_url:               https://ai-sbx.ryansg.com/my-app
deploy_commit:         <sha>
pipeline_run:          <ADO build URL>
jira_stories:          [PROJ-101, PROJ-102]
testrail_cases:        [C1001, C1002, C1003]
feature_files:         [Features/PROJ-101.feature]
test_data_manifest:    test-data-manifest.md
last_run_report:       results.trx
bugs_filed:            [C1002-BUG-1]
```

---

## Conflict resolutions (the two packs overlap in three places)

1. **Duplicate Jira story creation.** Deploy Step 7 (`create-deploy-jira-story`)
   and QA stage 2 (`jira-story-writer`) both create stories. This orchestrator
   **skips deploy Step 7** — `jira-story-writer` wins because its stories carry
   Gherkin AC that stages C2–C3 require; deploy's descriptive stories have no AC
   and would break the traceability chain.

2. **Two kinds of tests.** `unit-test-generator` (Phase B) and
   `playwright-dotnet-scripts` (Phase C) both write tests — keep both, they are
   different layers: unit tests gate the CI pipeline; Playwright is E2E against the
   deployed app. Playwright project lives in a separate `tests-e2e/` folder (or
   separate repo) so `detect-stack` and the CI test stage never pick it up.

3. **Requirements source of truth.** Deploy Step 7 derives intent from source code;
   QA pack derives it from the requirements doc. This orchestrator fixes the doc as
   source of truth (Phase A extraction) for all downstream stages.

---

## Gates and checkpoints

Hard gates (pipeline stops):
- B3 — unit tests must pass locally before pipeline files are generated
- B5 — CRITICAL vulnerabilities block the push
- C5 pre-run — `{{APP_URL}}/health` must return 200 (deploy finished) before the
  E2E suite runs; poll with timeout, fail with the ADO pipeline link if it never
  comes up

User confirmations (never auto-push):
- Before pushing stories to Jira (C1)
- Before pushing cases to TestRail (C2)
- Before `git push main` (B6) — this triggers a real deployment
- Before filing bugs (C5) — show proposed list first, de-dupe against open bugs

On any stage failure: stop, report, do not continue downstream. Exception: test
failures in C5 are expected output (they trigger bug filing), not pipeline errors.

---

## How to run

1. Confirm scope with the user: full A→C, or entry midway (existing repo → start at
   Phase B; already deployed → start at Phase C with the app URL).
2. Verify access up front per phase: file/bash/dotnet (A, C3–C5), `cc` CLI +
   ADO/ACR/AKS config (B), Jira MCP (C1–C2), TestRail MCP (C2, C5). Name the
   blocked stage explicitly if something is missing — don't silently skip.
3. Run stages in order, one at a time, showing each stage's output before the next.
4. On requirements-doc change mid-run: re-run only affected downstream stages
   (extraction diff decides — model change reruns A/C4, new feature reruns C1–C5
   for that feature only, copy change may rerun nothing).
5. End with the final summary from the manifest: app URL, pipeline run, story keys,
   case IDs, pass/fail counts, bugs filed.
