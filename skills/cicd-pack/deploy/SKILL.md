# Skill: deploy

## Purpose
Top-level orchestrator. Takes a new application repo from zero to a running ADO pipeline
with Kubernetes manifests ready to deploy. There is no IaC, no Terraform, no Bicep — pods
are created by the CD pipeline directly on the shared AKS cluster.

## Usage

```bash
# First time: onboard a new repo — auto-fetch config, detect stack, generate pipeline files
cc run deploy --init

# Day-to-day: regenerate pipeline if stack changed, push
cc run deploy

# Dry run — show what would happen, no changes made
cc run deploy --dry-run

# Pipeline files only (skip git push)
cc run deploy --no-push
```

---

## Pipeline Registration — NOT done by this skill

The ADO pipeline registration (the entry in ADO Pipelines pointing at the repo) is done
**once by the DevOps team** during repo setup. It points at `.azure/pipeline-entry.yml` —
a fixed stub file committed by DevOps that never changes.

`cc run deploy --init` generates `azure-pipelines.yml` and all `CICDTemplate/` files.
The registered pipeline finds them automatically because `.azure/pipeline-entry.yml`
delegates to `azure-pipelines.yml`:

```yaml
# .azure/pipeline-entry.yml  (committed by DevOps — never touched by this skill)
trigger:
  branches:
    include:
      - main
pool:
  name: 'Application Build EUS2 Pipelines'
extends:
  template: ../azure-pipelines.yml
```

This separation means:
- The pipeline registration survives `azure-pipelines.yml` being regenerated or updated
- Developers never need "Edit build pipeline" or "Queue builds" ADO permissions
- The branch policy fires on every push to `main` regardless of what is in `azure-pipelines.yml`

---

## `--init` Flow (First-Time Onboarding)

Run once per new application repo. No Azure resources are created — only files
are generated and pushed to Azure Repos.

```
Step 1: Bootstrap config.yml
        Read .claude/config.yml already present in the repo (committed by DevOps team).
        Compare hash against org config repo to check for updates.
        If up to date → proceed silently.
        If outdated → show diff and prompt to update [Y/n].

Step 2: detect-stack
        Scan repo → write .claude/stack-manifest.yml
        If containerized: false → print warning and trigger Step 2.5

Step 2.5: generate-dockerfile  (only when containerized: false)
        Detect runtime and version from stack-manifest.yml
        Generate multi-stage Dockerfile + .dockerignore for the detected runtime
        Update stack-manifest.yml → containerized: true
        Skipped automatically if Dockerfile already exists

Step 3: generate-unit-tests  ← NEW
        Invoke the unit-test-generator skill using the runtime from stack-manifest.yml.
        Claude Code reads the codebase and generates a full test project with:
          - Happy-path and edge-case tests for all public methods / exported functions
          - Mocks for all external dependencies (DB, HTTP, file I/O)
          - A /health endpoint test asserting HTTP 200
        Verify tests run locally before proceeding:
          dotnet test --no-build   |  npx jest --passWithNoTests
          pytest --collect-only    |  mvn test -Dsurefire.failIfNoSpecifiedTests=false
        ⛔ GATE: If local test verification fails, stop here.
           Do NOT proceed to Step 4. Surface the error clearly:
           "Unit tests failed local verification — fix errors before pushing to main.
            The pipeline triggers immediately on push to main and will fail without
            passing tests."

Step 4: generate-pipeline
        Generate azure-pipelines.yml and all CICDTemplate/ files
        Generate k8s/ manifests if not already present
        Does NOT register a pipeline in ADO — that was done by DevOps during repo setup
        Does NOT touch .azure/pipeline-entry.yml — that file is owned by DevOps

Step 5: setup-git-hooks
        Write the full hook logic to .claude/hooks/ (these files ARE committed to the repo):
          .claude/hooks/pre-commit  — stack regen + config freshness check
          .claude/hooks/pre-push    — YAML lint + k8s dry-run + secrets scan
          .claude/hooks/commit-msg  — conventional commit format
        Install a one-line delegating stub into .git/hooks/ for each hook:
          #!/bin/bash
          HOOK="$(git rev-parse --show-toplevel)/.claude/hooks/<hook-name>"
          [ -x "$HOOK" ] && exec "$HOOK" "$@"
        The stub in .git/hooks/ never changes — it always delegates to .claude/hooks/.
        Future updates to hook logic only require updating .claude/hooks/ (committed, versioned).
        Users never copy or edit .git/hooks/ manually.

Step 5.5: pre-push-vuln-scan --install-hook
        Append vulnerability scanning to the pre-push hook installed in Step 5
        Scanners run in parallel on every git push:
          • npm audit --audit-level=high   (JS/TS repos — triggered by package.json)
          • pip-audit                       (Python repos — triggered by requirements.txt)
          • trivy fs --severity HIGH,CRITICAL (always — covers IaC, Dockerfiles, secrets)
        Auto-fix (when vuln_scan.auto_fix: true in config.yml):
          • JS/TS  → npm audit fix, then re-scan
          • Python → pip-audit --fix, then re-scan
          • IaC/Dockerfile → no auto-fix; findings written to report for manual review
        ⛔ GATE: Push is blocked if CRITICAL findings remain after auto-fix
                 HIGH findings emit a warning but do not block
        Report written to .claude/vuln-report-<timestamp>.json on every scan

Step 6: git-commit-push
        Stage all generated files → commit → push to main in Azure Repos
        The branch policy configured by DevOps fires automatically on push to main
        No manual pipeline trigger needed — developer has no pipeline permissions

Step 7: create-jira-epic-and-stories  ← runs directly as part of cc run deploy --init
        Invoke cc run create-deploy-jira-story directly (NOT via git hook).
        This reads the app source files, creates a Jira Epic, and creates Stories under it.
        cc run deploy --init is the only command the developer needs to run — no separate
        git push, no manual Jira step.
        The pre-push hook handles lint/audit/secrets on every future push but does NOT
        create Jira issues — that is done once here, directly.

Done ✅
```

### What `--init` does NOT do
- Does not register or modify the ADO pipeline (DevOps owns this via .azure/pipeline-entry.yml)
- Does not touch .azure/pipeline-entry.yml
- Does not create the AKS namespace (created by the CD pipeline on first deploy)
- Does not create Key Vaults, managed identities, or any Azure resources
- Does not prompt for subscription ID, ACR name, AKS name, or service connection
- Does not overwrite an existing Dockerfile
- Does not overwrite existing test files (appends `_generated` suffix if a conflict is found)

---

## Standard Deploy Flow (Day-to-Day)

```
cc run deploy
      │
      ▼
[0] config-check
    Compare local config.yml hash against org config repo
    If outdated → warn "run cc run deploy --init to refresh config"
    Never auto-updates outside of --init
      │
      ▼
[1] detect-stack
    If stack unchanged → skip steps 2-3
      │
      ▼
[2] generate-pipeline  (only if STACK_CHANGED=true or --force)
    Regenerate azure-pipelines.yml + CICDTemplate/ files
    Pipeline registration in ADO is unaffected — it still points at .azure/pipeline-entry.yml
      │
      ▼
[2.5] pre-push-vuln-scan
    Run npm audit / pip-audit / trivy fs on the current working tree
    Auto-fix applied if vuln_scan.auto_fix: true (default)
    ⛔ GATE: If CRITICAL findings remain after auto-fix → stop, do NOT push
             "Fix critical vulnerabilities before pushing.
              See .claude/vuln-report-<timestamp>.json for details."
    HIGH findings → warn and continue
    Skipped entirely if vuln_scan.enabled: false in .claude/config.yml
      │
      ▼
[3] git-commit-push
    Stage: azure-pipelines.yml, CICDTemplate/, k8s/, .claude/stack-manifest.yml
    Commit: "ci: regenerate pipeline [skip ci]"
    Push to main → branch policy fires → pipeline picks up new azure-pipelines.yml automatically
      │
      ▼
Done ✅
```

---

## config.yml — Centrally Distributed

Pre-committed to the repo by the DevOps team. Never generated per-app.
To change a value, the DevOps team raises a PR in the org config repo — all apps
pick it up on their next `cc run deploy --init`.

```yaml
# .claude/config.yml
# Pre-committed by DevOps team. DO NOT edit — raise a PR in the org config repo.

azure:
  subscription_id:    "<uuid>"
  location:           "eastus2"
  acr_login_server:   "acrdevopseus2001.azurecr.io"
  acr_resource_group: "rg-shared"
  aks_cluster:        "myorg-aks"
  aks_resource_group: "rg-platform"

azure_devops:
  org:                "https://dev.azure.com/myorg"
  project:            "MyProject"
  service_connection: "sc-aipoc_online_nprd_global_ado_01"
  agent_pool:         "Application Build EUS2 Pipelines"
  artifacts_feed:     "ai-core-services"

security:
  cxone_service_connection: "ai-core-service-Checkmarx"
  cxone_tenant:             "ryan-specialty"
  smtp_server:              "smtp.ryansg.com"
  alert_email_from:         "cloud@ryansg.com"
  alert_email_to:           "cloud@ryansg.com"
```

---

## AKS Namespace Creation

Namespaces are not pre-created. The CD pipeline creates the production namespace on the fly
on first deploy:

```bash
kubectl get namespace {{APP_NAME}}-production 2>/dev/null || \
  kubectl create namespace {{APP_NAME}}-production
```

---

## Generated File Structure

```
<repo-root>/
  .azure/
    pipeline-entry.yml               ← committed by DevOps — NEVER modified by this skill
  azure-pipelines.yml                ← generated by generate-pipeline
  CICDTemplate/
    utils/
      security_scan.yml
      promote_artifact.yml
    ci_stage_build.yml               ← includes unit test run step
    cd_stage_production.yml
  k8s/
    deployment.yml
    service.yml
    configmap.yml
    hpa.yml
  Dockerfile                         ← generated by generate-dockerfile (if missing)
  .dockerignore
  tests/                             ← generated by unit-test-generator (Step 3)
    (framework-specific test project)
  .claude/
    config.yml                       ← pre-committed by DevOps team
    stack-manifest.yml               ← auto-generated by detect-stack
    vuln-report-<timestamp>.json     ← written by pre-push-vuln-scan on each scan
```

---

## Error Recovery

| Failure                        | Recovery                                                                      |
|--------------------------------|-------------------------------------------------------------------------------|
| config.yml missing             | Contact DevOps team — they must pre-commit it before handover                 |
| config.yml outdated            | Run cc run deploy --init to fetch latest and confirm update                   |
| detect-stack fails             | Check project root; ensure supported runtime files are present                |
| Unit test generation fails     | Fix compilation/import errors reported by the skill, then re-run --init       |
| Unit tests fail verification   | Fix failing tests before pushing — pipeline triggers on main immediately      |
| Pipeline not triggering        | Check branch policy is set on main branch (DevOps team)                       |
| Pipeline YAML errors           | Run cc run deploy --dry-run to validate before pushing                        |
| Git push fails                 | Check Azure Repos Contributor access for your account                         |
| Vuln scan blocks push          | Review .claude/vuln-report-*.json; fix CRITICALs or add CVE to .trivyignore for confirmed false-positives |
| `trivy: command not found`     | Run `winget install AquaSecurity.Trivy`; ensure Trivy install dir is on PATH  |
| npm audit blocks after fix     | Unfixable advisory — bump the dependency manually, then re-run cc run deploy  |
| First pod deploy fails         | Check kubectl logs in namespace; verify image tag in ACR                      |

---

## Output Summary

```
════════════════════════════════════════════════════
✅  Onboarding complete: my-api
════════════════════════════════════════════════════

  Pipeline:   registered by DevOps team, auto-triggered by branch policy on main
  ACR image:  acrdevopseus2001.azurecr.io/my-api:latest
  AKS:        myorg-aks  (namespace created on first pipeline run)

  Files generated and pushed:
    Dockerfile  +  .dockerignore    (generated — no Dockerfile was present)
    azure-pipelines.yml
    CICDTemplate/  (4 files)
    k8s/           (4 files)
    tests/         (unit test project — framework detected automatically)
    .claude/stack-manifest.yml

  NOT touched:
    .azure/pipeline-entry.yml       (DevOps owned — never modified)
    .claude/config.yml              (DevOps owned — never modified)

  Pre-push: vuln scan (npm audit / pip-audit / trivy) → blocks on CRITICAL findings
  Push to main → build → unit tests → Checkmarx scan → deploy to my-api-production
════════════════════════════════════════════════════
```
