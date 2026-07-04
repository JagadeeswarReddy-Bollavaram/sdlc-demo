# Requirements Traceability

| Requirement | Implementation | Story | Test cases |
|---|---|---|---|
| FR-1 create task + validation | app/server.js `POST /tasks` | PROJ-101 | C1001, C1002, C1003, C1004 |
| FR-2 list tasks newest first | app/server.js `GET /tasks` | PROJ-102 | C1005 |
| FR-3 complete task / unknown id | app/server.js `POST /tasks/:id/complete` | PROJ-103 | C1006, C1007 |
| FR-4 health endpoint | app/server.js `GET /health` | PROJ-104 | C1008 |
