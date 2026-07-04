---
name: test-data-generator
description: Generates test data fixtures (valid, invalid, and boundary data sets) matching an application's schema and the needs of specific test cases or Playwright scripts. Use whenever the user asks to create test data, seed data, fixtures, or mock data for testing, especially when it needs to align with test case types (positive/negative/boundary) or an existing data model/schema.
---

# Test Data Generator

## Process

1. **Get the schema.** Pull the application's data model — from `app-scaffolding`'s output if available, or by reading the app's actual models/migrations/API schema directly. Don't guess field types/constraints; read them.
2. **Get the test case list.** Each test case (from `test-case-generator`) specifies what kind of data it needs by its `type` field:
   - `Positive` → valid data respecting all constraints
   - `Negative` → data violating a specific constraint (wrong type, missing required field, unauthorized value)
   - `Boundary` → edge values (empty string, max length, zero, negative numbers, exact limit values, one-past-the-limit)
3. **Generate one named data set per distinct need**, not one giant shared fixture — scripts should reference data by intent (e.g. `valid_user`, `invalid_password_user`, `max_length_username_user`) so the mapping from step definition to data set is obvious. Match the naming used in the generated Playwright step definitions (stage 4) exactly.
4. **Respect real constraints.** If the schema says a field is unique, don't generate duplicate values for positive cases (that would create a false negative test). If a field has a regex/format constraint, generate valid-format data for positive cases and invalid-format for negative cases deliberately, not accidentally.
5. **Never generate real PII.** Use clearly fake but realistic-looking data (e.g. `test.user+{{id}}@example.com`), never real names/emails/phone numbers/SSNs scraped from anywhere.
6. **Output format**: match whatever the automation project already uses — JSON/CSV fixture files, a seed script, or an API-based data setup step. Check `playwright-dotnet-scripts`' `TestDataProvider` pattern (or equivalent) for how data is consumed, and produce data in that exact shape.
7. **Idempotency**: if data will be used for repeated test runs, either make it re-creatable (e.g. seed script that resets state) or clearly namespaced per run (e.g. timestamp/GUID suffix) so repeated runs don't collide on unique constraints.

## Output

Test data files/fixtures keyed by the named data sets referenced in the generated Playwright scripts, plus a short `test-data-manifest.md` listing each data set name, its purpose, and which test cases use it.

## Handoff

Pass file paths and the manifest to `test-runner-bug-reporter` so it can reset/reseed data between runs if needed.
