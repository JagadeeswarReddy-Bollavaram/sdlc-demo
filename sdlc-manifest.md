# SDLC Pipeline Manifest — Task Manager POC (run: 2026-07-04)

| Field | Value |
|---|---|
| requirements_doc | docs/requirements.md |
| repo_path | app/ |
| assumptions | app/assumptions.md |
| traceability | app/requirements-traceability.md |
| stack | node 22 (stdlib http, zero deps) |
| app_name | task-manager-poc |
| app_url | http://localhost:3210 (Phase B skipped — no ADO/AKS access; would be https://ai-sbx.ryansg.com/task-manager-poc) |
| jira_stories | PROJ-101..104 (local file qa/stories/stories.md — no Jira connector) |
| testrail_cases | C1001..C1008 (local file qa/test-cases/test-cases.json — no TestRail connector) |
| feature_files | qa/e2e/tasks.e2e.test.js (node:test substitution — no dotnet for Playwright .NET) |
| test_data_manifest | qa/test-data/fixtures.json (5 named sets: valid, second_valid, empty, max_length=100, over_limit=101) |
| last_run_report | qa/reports/test-run-report.md — 8/8 pass |
| bugs_filed | none (0 failures) |

## Stage log

| Stage | Skill (real pipeline) | Executed as | Status |
|---|---|---|---|
| A1 build | app-scaffolding | full | ✅ |
| B deploy | cc run deploy --init | **skipped** — needs org ADO/ACR/AKS | ⏭ |
| C1 stories | jira-story-writer | Gherkin stories → local file | ✅ |
| C2 cases | test-case-generator | 8 cases (4 pos / 2 neg / 2 boundary) → local JSON | ✅ |
| C3 scripts | playwright-dotnet-scripts | node:test substitution (no dotnet) | ✅ |
| C4 data | test-data-generator | named fixtures, programmatically exact boundary lengths | ✅ |
| C5 run+report | test-runner-bug-reporter | node --test + report, health-gate before run | ✅ 8/8 |
