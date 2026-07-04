---
name: test-case-generator
description: Reads a Jira user story and its acceptance criteria and generates structured test cases (positive, negative, boundary), then pushes them to TestRail via the TestRail MCP/API and links them back to the Jira story. Use whenever the user asks to create test cases from a Jira story, generate a test plan, or "write tests" for a story/feature at the case-design level (not code). For actual automation scripts, use playwright-dotnet-scripts instead.
---

# Test Case Generator (Jira → TestRail)

## Prerequisites

Requires Jira API/MCP access (to read the story) and TestRail API/MCP access (to push cases). If either is missing, tell the user which is needed before proceeding.

## Process

1. **Fetch the story.** Pull title, description, and acceptance criteria from Jira via the API (`GET /rest/api/3/issue/{key}`). Read linked subtasks and comments too — edge cases are often discussed there rather than in the AC itself.
2. **Check TestRail field config first.** Call `get_case_fields` (or equivalent) before generating cases — custom fields, priority scales, and case types vary by project. Don't assume a generic field set.
3. **Generate one or more test cases per AC scenario.** Each Gherkin scenario in the story typically maps to one test case, but split further if a scenario implies multiple distinct verifications. Always include:
   - Positive/happy-path cases
   - Negative cases (invalid input, unauthorized access, error states)
   - Boundary cases (empty, max length, zero, off-by-one, concurrent actions if relevant)
   Don't default to happy-path only — this is the most common failure mode of AI-generated test cases.
4. **Structure each case** per `templates/test_case_schema.json`:
   ```json
   {
     "title": "",
     "preconditions": "",
     "steps": ["", ""],
     "expected_result": "",
     "priority": "High | Medium | Low",
     "type": "Positive | Negative | Boundary",
     "jira_story": "PROJ-123",
     "ac_scenario": "name of the Gherkin scenario this covers"
   }
   ```
5. **Validate the generated JSON** before pushing — malformed output should fail loudly here, not silently corrupt a TestRail push.
6. **Confirm with the user** before pushing to TestRail if this is a first run for the project (field mapping mistakes are easy to make once, then propagate). Subsequent runs on the same project can skip this if the user has said to proceed automatically.
7. **Push via TestRail `add_case`** under the correct suite/section (ask the user which suite/section if not specified).
8. **Write back to Jira**: add a comment on the story linking the created TestRail case IDs.

## Output

List of TestRail case IDs, each mapped to its Jira story and AC scenario. Feed this to `playwright-dotnet-scripts`.

## Common pitfalls to avoid

- Generating vague steps ("test the login") instead of literal, executable steps a human or script could follow
- One case per story instead of one per scenario/condition — under-coverage
- Missing negative/boundary cases
- Pushing without checking TestRail's actual field configuration first
