---
name: test-runner-bug-reporter
description: Runs a Playwright .NET test suite, parses the results, and automatically files bugs in TestRail for failing test cases with repro steps, logs, and screenshots attached, linked to the originating TestRail case and Jira story. Use whenever the user asks to run tests and report failures, execute the automation suite, or "raise bugs" / "log defects" from a test run. Requires TestRail API/MCP access.
---

# Test Runner & Bug Reporter

## Prerequisites

- A runnable Playwright .NET project (from `playwright-dotnet-scripts`) with test data in place (from `test-data-generator`)
- `dotnet` CLI / Playwright test runner available in the execution environment
- TestRail API/MCP access to file bugs

## Process

1. **Confirm the target environment before running.** Never run tests against a production or shared environment without explicit confirmation — ask if unclear.
2. **Run the suite**:
   ```bash
   dotnet test --logger "trx;LogFileName=results.trx" --logger "html;LogFileName=results.html"
   ```
   Capture stdout/stderr and the structured result file (`.trx`), not just console output — you need structured pass/fail/error per test to map back to TestRail case IDs reliably.
3. **Parse results**, extracting for each test: pass/fail/skipped status, the `@TestRail-C####` tag (set in stage 4), error message, stack trace, and screenshot/trace file path if Playwright captured one on failure.
4. **Distinguish failure types before filing anything**:
   - **Application bug**: assertion failed because actual app behavior didn't match expected — file a TestRail bug
   - **Test/script defect**: error is a locator-not-found, timeout, or script exception unrelated to app logic — flag for script review, don't file an app bug
   - **Environment/data issue**: connection errors, missing test data — flag as environment issue, don't file an app bug
   Filing bugs for the second and third categories creates noise and erodes trust in the pipeline — be conservative and only auto-file bugs for clear application-behavior mismatches. When uncertain, ask the user rather than auto-filing.
5. **De-duplicate.** Before filing, check TestRail for an existing open bug linked to the same case ID from a prior run — if one exists and is still open, add a comment/re-run note instead of creating a duplicate.
6. **Draft bug reports** (don't auto-submit without a final list review by the user on first runs of a new project):
   ```
   Title: [Case C####] {{concise description of what failed}}
   Steps to reproduce: {{from the test case steps}}
   Expected result: {{from the test case}}
   Actual result: {{from the assertion failure message}}
   Environment: {{env under test}}
   Attachments: {{screenshot/trace file}}
   Linked TestRail case: C####
   Linked Jira story: PROJ-###
   ```
7. **File via TestRail API** (`add_result` on the case to log the failed run, plus a linked bug/defect per your TestRail defect workflow — some TestRail setups integrate directly with Jira for defects; if so, file the bug in Jira instead and link it, per the project's actual defect-tracking home).
8. **Update the pipeline manifest** with the run summary and bug IDs filed.

## Output

- Test run report (pass/fail counts, links to `.trx`/HTML report)
- List of bugs filed (or flagged-but-not-filed items needing human review) with links

## Common pitfalls to avoid

- Filing a bug per failure without checking for duplicates across repeated runs
- Filing app bugs for flaky/environment failures
- Losing the mapping between a failing test and its TestRail case because the `@TestRail-C####` tag wasn't threaded through from stage 4
