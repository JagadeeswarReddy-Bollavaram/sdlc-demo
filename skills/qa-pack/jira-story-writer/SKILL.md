---
name: jira-story-writer
description: Converts a requirements document (or requirements extraction from app-scaffolding) into Jira user stories with Gherkin-style acceptance criteria, and pushes them to Jira via the Jira MCP/API connector. Use whenever the user asks to create user stories, write acceptance criteria, or turn requirements into Jira tickets. Also use when asked to break down an epic into stories.
---

# Jira User Story & Acceptance Criteria Writer

## Prerequisites

Requires Jira API/MCP access. If not connected, tell the user which connector is needed before proceeding — don't draft stories assuming you can push them.

## Process

1. **Get the requirement source.** Either a requirements doc, or (preferred, if the pipeline already ran stage 1) the structured requirements extraction from `app-scaffolding`. Don't re-parse the raw doc if a clean extraction already exists.
2. **Break requirements into stories**, one per independently deliverable/testable unit of value. A story should be small enough to have a clear "done" — if a requirement bundles multiple user actions, split it into multiple stories rather than one large one.
3. **Write each story in standard format**:
   ```
   Title: As a [role], I want [capability], so that [benefit]

   Description: [1-2 sentence context]

   Acceptance Criteria (Gherkin):
   Scenario: [name]
     Given [precondition]
     When [action]
     Then [expected outcome]

   [Repeat Scenario block for each distinct condition - happy path, at minimum
   one negative case, and any boundary conditions mentioned or implied by the
   requirement]
   ```
   See `templates/story_template.md` for the full template including field mapping notes.
4. **Cover more than the happy path.** For every story, include at minimum: one positive scenario, one negative/error scenario, and any boundary case explicit or strongly implied in the requirement (empty input, max length, permission denial, etc.). This matters because `test-case-generator` downstream will generate one or more test cases per AC scenario — thin AC produces thin test coverage.
5. **Tag traceability.** If a requirement ID/traceability list exists from `app-scaffolding`, reference it in the story description so it's clear which requirement each story implements.
6. **Confirm before pushing.** Show the drafted stories to the user. Do not push to Jira without confirmation — story titles and field mappings (epic link, story points, labels) are often project-specific and worth a sanity check first.
7. **Push via Jira API**, capturing the returned issue keys.

## Output

List of Jira issue keys created, each with its title and AC. Feed this directly to `test-case-generator`.

## Notes

- If the project has custom Jira fields (e.g., a dedicated "Acceptance Criteria" field vs. embedding in description), check field config first — don't assume description-only.
- Keep AC in Gherkin (Given/When/Then) even if the team doesn't use BDD tooling — it maps cleanly to test cases and later to `.feature` files in stage 4.
