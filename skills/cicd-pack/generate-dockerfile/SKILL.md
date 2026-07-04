# Skill: generate-dockerfile

## Purpose
Generate a production-ready multi-stage Dockerfile and `.dockerignore` for the current
application. Runtime and version are read from `.claude/stack-manifest.yml`.

This skill runs automatically during `cc run deploy --init` when `containerized: false`
in the manifest. It can also be run standalone at any time.

## Trigger
- `cc run generate-dockerfile`
- Auto-invoked by `deploy --init` when `containerized: false` in stack-manifest.yml
- Never auto-runs on subsequent deploys — once a Dockerfile exists it belongs to the
  app team and is never overwritten without explicit confirmation

## Prerequisites
- `.claude/stack-manifest.yml` must exist (run `detect-stack` first)

---

## Template Files

All Dockerfile templates live under `templates/dockerfiles/` inside this skill's
directory. Read the matching template, substitute tokens, and write to the repo root.

```
templates/dockerfiles/
  dotnet.Dockerfile.tmpl      → Dockerfile  (when manifest.runtime = dotnet)
  node.Dockerfile.tmpl        → Dockerfile  (when manifest.runtime = node)
  python.Dockerfile.tmpl      → Dockerfile  (when manifest.runtime = python)
  java.Dockerfile.tmpl        → Dockerfile  (when manifest.runtime = java)
  go.Dockerfile.tmpl          → Dockerfile  (when manifest.runtime = go)
  .dockerignore.tmpl          → .dockerignore  (all runtimes — same file)
```

Template selection:

```
manifest.runtime = dotnet  →  read templates/dockerfiles/dotnet.Dockerfile.tmpl
manifest.runtime = node    →  read templates/dockerfiles/node.Dockerfile.tmpl
manifest.runtime = python  →  read templates/dockerfiles/python.Dockerfile.tmpl
manifest.runtime = java    →  read templates/dockerfiles/java.Dockerfile.tmpl
manifest.runtime = go      →  read templates/dockerfiles/go.Dockerfile.tmpl
(all runtimes)             →  read templates/dockerfiles/.dockerignore.tmpl
```

---

## Token Substitutions

| Token               | Source                                              | Example           |
|---------------------|-----------------------------------------------------|-------------------|
| `{{APP_NAME}}`      | manifest → app_name                                 | `my-api`          |
| `{{RUNTIME_VERSION}}`| manifest → version                                 | `8.0`             |
| `{{SOLUTION_FILE}}` | manifest → build.solution_file (dotnet only)        | `MyApp.sln`       |
| `{{MAIN_PROJECT}}`  | manifest → build.solution_file or single .csproj    | `MyApp/MyApp.csproj` |
| `{{ASSEMBLY_NAME}}` | Derived: main project filename without extension    | `MyApp`           |

---

## Runtime Selection & Defaults

| manifest.runtime | Default version if absent | Base images used                                              |
|------------------|--------------------------|---------------------------------------------------------------|
| `dotnet`         | `8.0`                    | `mcr.microsoft.com/dotnet/sdk` + `mcr.microsoft.com/dotnet/aspnet` |
| `node`           | `20`                     | `node:{version}-alpine` (build + runtime)                    |
| `python`         | `3.12`                   | `python:{version}-slim` (build + runtime)                    |
| `java`           | `21`                     | `maven:3.9-eclipse-temurin` + `eclipse-temurin:{version}-jre-alpine` |
| `go`             | `1.22`                   | `golang:{version}-alpine` + `gcr.io/distroless/static:nonroot` |

---

## Idempotency Rules

- If `Dockerfile` already exists: show a unified diff of what would change and prompt
  "Overwrite? [y/N]". Default is **N** — the app team owns the Dockerfile after generation.
- If `.dockerignore` already exists: same prompt.
- After writing both files, update `stack-manifest.yml` → `containerized: true`.
- If the user declines the overwrite, `containerized` stays as-is in the manifest.

---

## Post-Generation Verification

After writing the files, prompt the developer to verify the build locally:

```bash
# Build the image locally to catch errors before the pipeline runs
docker build -t {{APP_NAME}}:local .

# Smoke test: container starts and /health responds HTTP 200
docker run -d -p 8080:8080 --name {{APP_NAME}}-test {{APP_NAME}}:local
sleep 5
curl -s -o /dev/null -w "Health check: HTTP %{http_code}\n" http://localhost:8080/health
docker rm -f {{APP_NAME}}-test
```

If Docker is not available locally, skip verification — the pipeline will catch build
errors at Stage 2 (CI Build, Docker buildAndPush step).

---

## Common Post-Generation Adjustments

After generating, the app team should review these lines in the Dockerfile:

| Runtime | Line to review                         | Common change                              |
|---------|----------------------------------------|--------------------------------------------|
| dotnet  | `ENTRYPOINT ["dotnet", "{{ASSEMBLY_NAME}}.dll"]` | Verify assembly name matches project |
| node    | `CMD ["node", "dist/main.js"]`         | Change to `next start` for Next.js         |
| python  | `CMD ["uvicorn", "app.main:app", ...]` | Change to `python -m gunicorn` for Django/Flask (binary not on PATH when using pip --target) |
| java    | `HEALTHCHECK` path `/actuator/health`  | Update if using a different health endpoint|
| go      | `./cmd/server`                         | Update to match your main package path     |

---

## Example Run

```bash
$ cc run generate-dockerfile

📖 Reading .claude/stack-manifest.yml...
   Runtime:  dotnet 8.0
   App:      my-api
   Status:   containerized: false — Dockerfile not found

📂 Loading template: templates/dockerfiles/dotnet.Dockerfile.tmpl
🔧 Substituting tokens:
   RUNTIME_VERSION = 8.0
   SOLUTION_FILE   = MyApp.sln
   MAIN_PROJECT    = MyApp/MyApp.csproj
   ASSEMBLY_NAME   = MyApp

📝 Writing Dockerfile...       ✅
📝 Writing .dockerignore...    ✅
📝 Updating stack-manifest.yml → containerized: true

🐳 Verify locally:
   docker build -t my-api:local .
   docker run -p 8080:8080 my-api:local
   curl http://localhost:8080/health
```
