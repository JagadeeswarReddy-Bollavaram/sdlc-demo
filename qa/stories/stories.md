# Jira Stories (local — no Jira connector; would be pushed via jira-story-writer)

## PROJ-101 — As a user, I want to create a task, so that I can track my work

Implements: FR-1

```gherkin
Scenario: Create a task with a valid title
  Given the service is running
  When I POST /tasks with a title of valid length
  Then I receive 201 with the task, a unique id, and status "open"

Scenario: Reject a task with no title
  Given the service is running
  When I POST /tasks with an empty title
  Then I receive 400 with a validation error

Scenario: Reject a title over 100 characters
  Given the service is running
  When I POST /tasks with a 101-character title
  Then I receive 400 with a validation error

Scenario: Accept a title of exactly 100 characters
  Given the service is running
  When I POST /tasks with a 100-character title
  Then I receive 201 with the task
```

## PROJ-102 — As a user, I want to list tasks newest first, so that recent work is on top

Implements: FR-2

```gherkin
Scenario: List returns tasks newest first
  Given two tasks were created in order A then B
  When I GET /tasks
  Then B appears before A
```

## PROJ-103 — As a user, I want to complete a task, so that finished work is marked

Implements: FR-3

```gherkin
Scenario: Complete an existing task
  Given a task exists
  When I POST /tasks/{id}/complete
  Then I receive 200 and status is "complete"

Scenario: Complete an unknown task id
  Given no task with id 99999 exists
  When I POST /tasks/99999/complete
  Then I receive 404 with an error
```

## PROJ-104 — As an operator, I want a health endpoint, so that deploys can be verified

Implements: FR-4

```gherkin
Scenario: Health check responds
  When I GET /health
  Then I receive 200
```
