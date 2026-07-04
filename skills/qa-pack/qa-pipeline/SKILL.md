---
name: qa-pipeline
description: Orchestrates the full requirement-to-bug-report QA automation pipeline - takes a requirements document, scaffolds the application, writes Jira user stories and acceptance criteria, generates test cases, produces Playwright .NET feature files and scripts, generates test data, runs the suite, and files TestRail bugs on failure. Use this skill whenever the user asks to run the "full pipeline", "end to end QA automation", or asks for more than one of these stages together. If the user only asks for a single stage (e.g. just "write test cases from this Jira story"), use that stage's dedicated skill directly instead of this one.
---

# QA Pipeline Orchestrator

This skill sequences six stage-skills into one pipeline. It does not do the work itself — it decides which stage to run, in what order, gathers the required inputs/outputs between stages, and checkpoints with the user at the right moments.

## Pipeline stages (in order)

| # | Stage | Skill | Input | Output |
|---|-------|-------|-------|--------|
| 1 | Build app | `app-scaffolding` | Requirements doc | Application codebase |
| 2 | Write stories | `jira-story-writer` | Requirements doc | Jira stories + acceptance criteria |
| 3 | Generate test cases | `test-case-generator` | Jira story + AC | Structured test case list |
| 4 | Generate scripts | `playwright-dotnet-scripts` | Test cases | `.feature` files + Playwright C# step defs |
| 5 | Generate test data | `test-data-generator` | Test cases/scripts + app schema | Test data files/fixtures |
| 6 | Run + report | `test-runner-bug-reporter` | Scripts + test data | Test run report + TestRail bugs |

## How to run this

1. **Confirm scope.** Ask the user which stages to run — full pipeline from a requirements doc, or starting midway (e.g. they already have Jira stories and just want stages 3-6). Don't assume full pipeline if they only gave you a Jira key.
2. **Confirm required access.** Before starting, check that you actually have the tools needed for the stages in scope: Jira MCP/API for stages 2 and 3, TestRail MCP/API for stage 6, file/bash/dotnet access for stages 1, 4, 5, 6. If something is missing, tell the user which specific stage is blocked and what needs to be connected — don't silently skip it.
3. **Run stages in order, one at a time.** After each stage, show the user the output (story text, test case list, generated files, etc.) before moving to the next stage. Do not silently chain all six stages without checkpoints — each stage's output is an input a human may want to correct before it propagates downstream (a wrong acceptance criterion becomes a wrong test case becomes a wrong script).
4. **Carry state explicitly between stages.** Keep a running manifest (see `templates/pipeline-manifest.md`) of: requirements doc path, Jira story keys, test case IDs, generated file paths, test data file paths, last run report path, TestRail bug IDs raised. Pass this manifest forward so later stages don't have to re-derive context.
5. **On failure of any stage, stop and report** — don't proceed to the next stage with incomplete or unvalidated output. Exception: stage 6 (test runner) is expected to produce failures; that's the trigger for bug filing, not a pipeline error.
6. **At the end, summarize**: what was built, how many stories/test cases/scripts were created, pass/fail counts from the run, and links/IDs for Jira stories, TestRail cases, and any bugs filed.

## Checkpoints requiring explicit user confirmation

- Before pushing generated user stories to Jira (stage 2)
- Before pushing generated test cases to TestRail (stage 3)
- Before running the test suite against any environment that isn't clearly a local/sandbox/test environment (stage 6)
- Before filing bugs in TestRail (stage 6) — show the user the list of proposed bugs first; duplicate bug filing on a flaky test is a common failure mode

## Notes

- Each stage skill has its own field-mapping and formatting details (Jira custom fields, TestRail case fields, your team's Playwright/.NET conventions). This orchestrator doesn't duplicate those — read the stage skill when you get to that stage.
- If the requirements doc changes mid-pipeline, re-run only the affected downstream stages, not the whole pipeline.
