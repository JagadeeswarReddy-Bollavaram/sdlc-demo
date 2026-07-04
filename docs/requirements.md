# Requirements — Task Manager POC

## Functional Requirements

- **FR-1** Users can create a task by providing a title.
  - Title is required, 1–100 characters.
  - Creating a task returns the task with a unique id and status `open`.
- **FR-2** Users can list all tasks, newest first.
- **FR-3** Users can mark a task as complete by id.
  - Completing an unknown id returns an error.
- **FR-4** The service exposes a `/health` endpoint returning HTTP 200 for deployment checks.

## Non-Functional

- JSON REST API.
- No authentication (POC).

## Out of Scope

- Persistence (in-memory acceptable for POC).
- Editing or deleting tasks.
