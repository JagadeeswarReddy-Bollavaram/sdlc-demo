---
name: create-deploy-jira-story
description: >
  Called directly as Step 7 of cc run deploy --init. Reads all application
  source files in the repo, understands what the application does, creates a
  new Jira Epic that represents the application initiative, then creates user
  Stories as children underneath that Epic. Works for any language or framework.
  Content comes from the app code, not from infrastructure config.
---

# Skill: create-deploy-jira-story

## Purpose

Read the application source files in the repo, derive what the app is trying to
do, create a new Jira **Epic** that represents the application initiative, then
create one or more **Stories** as children underneath that Epic. Infrastructure
details (pipeline, k8s, ACR) are secondary context — the Epic and Stories
describe the application.

## Trigger

- **Automatically** — called directly by `cc run deploy --init` as **Step 7**,
  after the git commit and push complete. No hook, no marker file.
- **Manually** — `cc run create-deploy-jira-story` at any time.

## How it fits into deploy --init

```
cc run deploy --init
      │
      ├─ Step 1: config check
      ├─ Step 2: detect-stack
      ├─ Step 3: unit tests
      ├─ Step 4: generate pipeline + k8s
      ├─ Step 5: install git hook stubs
      ├─ Step 6: git commit + push
      └─ Step 7: cc run create-deploy-jira-story  ← THIS SKILL
                          │
                          ├─ reads app source files
                          ├─ creates Jira Epic
                          └─ creates Stories under that Epic
```

---

## Step 1 — Read the application source files

Scan and read the actual application files. Ignore infrastructure, config,
and generated files.

**Read these (application content):**
- `README.md` — project description and intent
- `index.html` / `*.html` — what the UI shows or links to
- `src/**/*.js`, `src/**/*.ts`, `src/**/*.jsx`, `src/**/*.tsx` — app logic
- `src/**/*.css`, `src/**/*.html` — UI content and structure
- `app/**/*`, `pages/**/*`, `components/**/*` — framework-specific app code
- `*.py`, `*.cs`, `*.java`, `*.go` — server-side logic
- Any other file that describes what the app does, not how it is built

**Ignore these (not application content):**
- `node_modules/`, `dist/`, `bin/`, `obj/`
- `Dockerfile`, `.dockerignore`, `azure-pipelines.yml`, `CICDTemplate/`, `k8s/`
- `.claude/`, `.git/`, `package-lock.json`, `package.json`
- `skills/`, `tests/`, `*.test.*`, `*.spec.*`

---

## Step 2 — Understand what the app does

From the files read in Step 1, answer these questions:

1. **What does this application display or do?**
   (e.g. "displays a landing page saying X", "provides an API for Y", "processes Z")

2. **Who is the intended user?**
   (infer from content, naming, README — default to "developer" if unclear)

3. **What is the goal or outcome?**
   (e.g. "prove the deployment pipeline works", "show a POC UI", "serve data to clients")

Use plain language. Do not invent features that are not in the files.

---

## Step 3 — Build the Epic title and Stories from what you found

### Epic title

The Epic represents the overall application initiative. Write a title that names
the app and its purpose at a high level:

```
Good:  "Claude POC — web application deployment to AI Sandbox"
Bad:   "Onboard hb-poc1 (Node.js/Vite) to AKS CI/CD pipeline"
```

### Epic description

1. **What the application is** — one short paragraph from the source files.
   Quote actual UI content where relevant (e.g. the heading text).

2. **Deployment target** — one sentence. Reference the ADO repo and target
   environment from `.claude/stack-manifest.yml` and `.claude/config.yml`.

3. **Goals / definition of done** — bullet list of what "done" looks like for
   this application initiative (app is reachable, content is correct, etc.).

### Story titles and user story statements

Derive one story per distinct user-visible capability of the application.
For a simple app with one screen/endpoint this is typically one story.
For an app with multiple pages, APIs, or workflows, create one story per area.

For each story, fill in:

```
Title: [specific capability, e.g. "Display Claude POC landing page"]

As a [who the user is],
I want [what the app does, from the source files],
So that [the goal or outcome].
```

**Story description sections:**

1. **What this story covers** — describe the specific capability in plain English.
   Quote actual content where relevant.

2. **Acceptance criteria** — based on what the app should do:
   - Does the app render / respond correctly?
   - Is the expected content visible / accessible?
   - Is the app reachable at its URL?

   Only add pipeline criteria (e.g. tests pass, Docker image built) if the
   user specifically asks for them.

---

## Step 4 — Create the Epic, then create Stories underneath it

### 4a — Ask for the Jira project key

Ask the user for the Jira project key if not already known (e.g. `AIA`).

### 4b — Look up the Epic issue type ID

Call `getJiraProjectIssueTypesMetadata` with the target project key.
Find the entry where `name == "Epic"` and note its `id` (a numeric string,
e.g. `"10000"`). You need this ID for the next step.

### 4c — Get mandatory Epic fields

Call `getJiraIssueTypeMetaWithFields` with:
- `projectIdOrKey` — Jira project key
- `issueTypeId` — the Epic `id` found in Step 4b

This returns every field for Epic creation, including which are `required: true`.
At minimum Jira typically requires:
- `summary` — the Epic title
- `customfield_10011` (Epic Name) — a short label shown in board views;
  set it to the same value as `summary` (field ID may differ per instance —
  use the actual ID returned by this call)

Collect all fields where `required: true` and include them in the create call.

**Note for AIA project:** The metadata shows only `issuetype`, `project`, `summary`, and `priority`
as `required: true`, but two additional fields are enforced by validators at create time:
- `customfield_11803` (Business-Unit) — pass `[{"id": "11997"}]` for "Corporate" or the appropriate BU
- `customfield_11805` (Strategic Pillar) — pass `{"id": "11805"}` for "Foundational"

These must always be included when creating an Epic in AIA.

### 4d — Create the Epic

Call `createJiraIssue` with:
- `projectKey` — Jira project key from Step 4a
- `summary` — Epic title from Step 3
- `issueTypeName` — `Epic`
- `description` — Epic description from Step 3 (ADF format)
- Epic Name field (actual field ID from Step 4c) — same value as `summary`
- All other `required: true` fields discovered in Step 4c
- `labels` — derived from app content, not infrastructure
  (e.g. `poc`, `web-app`, `claude`, `ai-sandbox`)

Save the returned Epic key (e.g. `AIA-360`).

### 4e — Create Stories as children of the Epic

For each story derived in Step 3, call `createJiraIssue` with:
- `projectKey` — same project key
- `summary` — Story title from Step 3
- `issueTypeName` — `Story`
- `description` — Story description + acceptance criteria from Step 3 (ADF format)
- `parent` — the Epic key created in Step 4d
- `labels` — same labels as the Epic

### 4f — Return a summary

Print a summary of what was created:

```
✅ Epic:   AIA-360  Claude POC — web application deployment to AI Sandbox
✅ Story:  AIA-361  Display Claude POC landing page
```

---

## Example

For a repo where `index.html` contains `<h1>this is claude poc</h1>` and
`README.md` says "Created via Azure DevOps MCP API":

**Epic title:**
> Claude POC — web application deployment to AI Sandbox

**Epic description:**
> A proof-of-concept web application that displays the "this is claude poc"
> landing page. Created via Azure DevOps MCP API and deployed from the
> HB_POC1 ADO repo to the AI Sandbox AKS cluster.
>
> **Goals:**
> - App is reachable at `https://ai-sbx.ryansg.com/hb-poc1`
> - Landing page displays expected heading
> - End-to-end deployment pipeline verified working

**Story title:**
> Display Claude POC landing page

**User story:**
> As a developer,
> I want a web page that confirms the Claude POC is live,
> So that I can verify the full deployment pipeline works end-to-end.

**Acceptance criteria:**
- [ ] Navigating to the app URL shows the heading "this is claude poc"
- [ ] The page is reachable at `https://ai-sbx.ryansg.com/hb-poc1`
- [ ] The page loads without errors in the browser
