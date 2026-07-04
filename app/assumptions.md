# Assumptions

- FR-1 does not specify duplicate-title behavior → duplicates allowed.
- FR-3 does not specify re-completing an already-complete task → treated as idempotent success (200).
- "Newest first" (FR-2) interpreted as reverse insertion order (no timestamps required for POC).
- Port not specified → defaults to 3210, overridable via PORT env var.
