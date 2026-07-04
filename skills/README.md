# SDLC Skills — Plug In & Use

16 Claude Code skills covering the full SDLC: build an app from requirements, deploy
it through Azure DevOps to AKS, and QA it end to end. Use any skill standalone, either
pack on its own, or the whole chain via the orchestrator.

---

## Install

Skills are folders containing a `SKILL.md`. Claude Code picks them up from either:

| Scope | Location | Use when |
|---|---|---|
| **Your projects (personal)** | `~/.claude/skills/` | You want them in every project |
| **One project (shared with team)** | `<repo>/.claude/skills/` | Whole team gets them on clone |

```bash
git clone https://github.com/JagadeeswarReddy-Bollavaram/sdlc-demo.git
cd sdlc-demo

# personal — all your projects
mkdir -p ~/.claude/skills
cp -R skills/cicd-pack/*/ skills/qa-pack/*/ skills/sdlc-e2e-orchestrator ~/.claude/skills/

# OR project-level — commit to your repo, team-shared
mkdir -p /path/to/your-project/.claude/skills
cp -R skills/cicd-pack/*/ skills/qa-pack/*/ skills/sdlc-e2e-orchestrator /path/to/your-project/.claude/skills/
```

Install only what you need — each skill is self-contained; the orchestrator and pack
orchestrators (`deploy`, `qa-pipeline`) just expect their stage skills to be present.

Verify: start a Claude Code session and ask *"what skills are available?"* — the
installed ones appear in the list.

---

## Use

Skills trigger automatically from natural language (matching their `description`), or
invoke explicitly with `/skill-name`. Examples:

| Say this | Triggers |
|---|---|
| "Build an app from this requirements doc" | `app-scaffolding` |
| "Turn these requirements into Jira stories with acceptance criteria" | `jira-story-writer` |
| "Generate test cases from PROJ-123" | `test-case-generator` |
| "Write Playwright automation for these test cases" | `playwright-dotnet-scripts` |
| "Create test data for these cases" | `test-data-generator` |
| "Run the suite and raise bugs for failures" | `test-runner-bug-reporter` |
| "Run the full QA pipeline on this doc" | `qa-pipeline` (stages 1–6) |
| "Onboard this repo to CI/CD" | `deploy` (--init flow) |
| "Generate a Dockerfile for this project" | `generate-dockerfile` |
| "Run the SDLC pipeline end to end" | `sdlc-e2e-orchestrator` (everything) |

---

## What's Inside

### `sdlc-e2e-orchestrator/` — the connector

Chains both packs: **build** (qa-pack stage 1) → **deploy** (cicd-pack) → **QA against
the deployed URL** (qa-pack stages 2–6). Carries one manifest across all stages,
resolves the packs' overlaps (duplicate Jira story creation, unit vs E2E test split),
and gates the E2E run on the deployed app's `/health`.

### `cicd-pack/` — repo → running pipeline on AKS (8 skills)

| Skill | Does |
|---|---|
| `deploy` | Orchestrator. `--init` = full onboarding; plain run = regen + push |
| `detect-stack` | Scans repo → `stack-manifest.yml` (runtime, version, DB, build files) |
| `generate-dockerfile` | Multi-stage Dockerfile + `.dockerignore` for the detected runtime |
| `unit-test-generator` | xUnit/Jest/pytest/JUnit tests incl. `/health` test; gates the pipeline |
| `generate-pipeline` | `azure-pipelines.yml` + `CICDTemplate/` + `k8s/` manifests |
| `setup-git-hooks` | pre-commit (stack regen), pre-push (lint/scan), commit-msg (conventional) |
| `pre-push-vuln-scan` | npm audit + pip-audit + trivy on every push; blocks CRITICAL |
| `generate-jira-userstory` | Jira Epic + Stories describing the deployed app |

Prerequisites: org Azure DevOps + ACR + AKS access, DevOps-committed `.claude/config.yml`
and `.azure/pipeline-entry.yml`. Without these, skip this pack (test locally instead —
see the demo in the repo root).

### `qa-pack/` — requirements → tested app + bug reports (7 skills)

| Skill | Does |
|---|---|
| `qa-pipeline` | Orchestrator for stages 1–6 below, with user checkpoints |
| `app-scaffolding` | Requirements doc → runnable app + assumptions + traceability |
| `jira-story-writer` | Requirements → Jira stories with Gherkin acceptance criteria |
| `test-case-generator` | Story AC → positive/negative/boundary cases → TestRail |
| `playwright-dotnet-scripts` | Cases → `.feature` + C# step defs + Page Objects, TestRail-tagged |
| `test-data-generator` | Schema-respecting named fixtures per case type |
| `test-runner-bug-reporter` | Runs suite, classifies failures, files de-duped TestRail bugs |

Prerequisites by stage: none for scaffolding; Jira MCP connector for stories/cases;
TestRail MCP connector for case push + bug filing; `dotnet` + Playwright for
automation stages. Missing a connector? The skills fall back to writing local files —
the demo in this repo ran exactly that way.

---

## Typical Adoption Paths

- **QA engineer**: install `qa-pack` only → "generate test cases from this story" /
  "run the suite and report".
- **App developer**: install `cicd-pack` only → "onboard this repo to CI/CD".
- **Full flow**: install everything → point the orchestrator at a requirements doc.
- **Trying it out**: repo root has a complete executed demo (`app/`, `qa/`,
  8/8 passing suite) — replay with `node --test qa/e2e/tasks.e2e.test.js`.

## Customizing

Each `SKILL.md` is plain markdown instructions — edit to match your org: Jira project
keys and custom fields (`jira-story-writer`, `generate-jira-userstory`), TestRail
suite/section conventions (`test-case-generator`), ADO org/ACR/AKS values
(`cicd-pack/*`), test framework preferences (`unit-test-generator`,
`playwright-dotnet-scripts`). Skills referencing `templates/` files expect you to add
those templates for your stack; without them Claude improvises from the inline examples.
