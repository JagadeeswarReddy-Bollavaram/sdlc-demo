---
name: playwright-dotnet-scripts
description: Converts structured test cases (from TestRail or test-case-generator) into Gherkin .feature files and Playwright automation scripts written in C#/.NET, following Page Object Model conventions. Use whenever the user asks to generate automation scripts, feature files, step definitions, or Playwright tests in .NET/C# from test cases or acceptance criteria. Not for other Playwright languages (JS/TS/Python) unless the user asks for those explicitly.
---

# Playwright .NET Script Generator

## Prerequisites

- The target project's existing folder structure and conventions (check for an existing `Features/`, `StepDefinitions/`, `PageObjects/` layout before creating a new one — match what's there rather than imposing a new structure)
- Playwright .NET installed in the target project (`Microsoft.Playwright`, `Microsoft.Playwright.NUnit` or `SpecFlow`/`Reqnroll` depending on the project's BDD framework)

## Process

1. **Read existing project conventions first.** Look for existing `.feature` files, step definition classes, and page objects. Match naming, namespace, and folder patterns exactly — don't introduce a second convention into an existing repo.
2. **One `.feature` file per Jira story** (not per test case), containing one `Scenario` per test case, mirroring the AC scenarios from the story. See `templates/sample.feature`.
3. **Generate step definitions** in C#, following Page Object Model:
   - Step definition classes call into page objects; they should not contain raw Playwright locators inline if a page object already exists for that page
   - If a page object doesn't exist yet for a page under test, generate one in `PageObjects/` with locators and action methods, then reference it from the step definition
   - Use `[Given]`, `[When]`, `[Then]` attributes (SpecFlow/Reqnroll) matching the Gherkin steps exactly, including parameter binding for variable data
   See `templates/sample_steps.cs` and `templates/sample_pageobject.cs`.
4. **Assertions**: use explicit Playwright assertions (`Expect(locator).ToBeVisibleAsync()`, etc.), not just try/catch — the test runner in stage 6 needs clean pass/fail signals, not swallowed exceptions.
5. **Parameterize test data references** rather than hardcoding values inline — pull from the test data source that `test-data-generator` produces (stage 5), referenced by a fixture/config path, so the same script works across data sets.
6. **Traceability**: include a comment or tag at the top of each scenario linking back to the TestRail case ID and Jira story key (e.g. `@TestRail-C1234 @PROJ-123`), so stage 6's failure-to-bug mapping can identify which case failed.
7. **Compile-check** the generated C# if you have a .NET toolchain available (`dotnet build`) before handing off — catch syntax errors here, not at test-run time.

## Output

- `.feature` files (one per story)
- Step definition `.cs` files
- New/updated page object `.cs` files
- All referencing test data via a fixture path, not hardcoded values

## Handoff

Pass the list of generated files and their TestRail-case tags to `test-data-generator` (for data) and `test-runner-bug-reporter` (for execution + the tag mapping it needs to file bugs against the right case).
