---
name: app-scaffolding
description: Builds a working application (backend, frontend, or both) from a requirements document. Use whenever the user uploads or references a requirements/spec/BRD document and asks to build, scaffold, or generate an application, module, or feature from it. Also use for turning functional requirements into a project structure, data models, API endpoints, and UI screens. Not for writing tests or test scripts - see test-case-generator and playwright-dotnet-scripts for that.
---

# Application Scaffolding from Requirements

Turns a requirements document into a running application skeleton.

## Process

1. **Read the requirements doc fully first.** Use the file-reading/pdf-reading/docx skills as appropriate if it's an uploaded file. Do not start generating code from a partial read.
2. **Extract structured requirements** before writing any code:
   - Functional requirements (features, user actions)
   - Entities/data model (nouns in the doc — these become your DB tables/models)
   - Non-functional requirements (auth, roles, performance, integrations mentioned)
   - Explicit out-of-scope items (don't build what's excluded)
   Write this extraction out and confirm it against the doc before proceeding — it's the contract the rest of the pipeline (stories, test cases) will be built against.
3. **Propose a stack** if the user hasn't specified one, based on the requirements (e.g., simple CRUD app → lightweight stack; requirements mentioning specific tech → use that). Confirm with the user before scaffolding if it's a non-trivial choice.
4. **Scaffold in this order**: data models → API/business logic layer → UI. Keep each functional requirement traceable to the code that implements it (e.g., a comment or commit referencing the requirement ID) — this traceability is what lets stage 3 (test case generation) map test cases back to requirements later.
5. **Do not silently invent requirements.** If the doc is ambiguous or missing detail (e.g., "users can reset their password" with no mention of email vs SMS), flag the assumption you're making rather than guessing silently, and note it in a running `assumptions.md` file in the repo.
6. **Produce a requirements traceability list** at the end: requirement ID → implementing file(s)/module(s). This feeds directly into `jira-story-writer`, which needs the same requirement breakdown to write stories.

## Output

- A working, runnable project structure in the target language/framework
- `assumptions.md` listing any gaps you filled in and how
- `requirements-traceability.md` mapping each requirement to code

## Handoff to next stage

Pass the requirements extraction (step 2) and traceability list to `jira-story-writer` — it should not re-derive requirements from the raw doc if this stage already structured them.
