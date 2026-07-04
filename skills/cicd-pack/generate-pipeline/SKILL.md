# Skill: generate-pipeline

## Purpose
Read `.claude/stack-manifest.yml` and generate the full org-standard multi-template
pipeline structure. All applications deploy as pods in the shared AKS cluster —
there is no compute target selection. The generate-pipeline skill always produces
the same 7-file output regardless of runtime.

```
azure-pipelines.yml                       ← main entry, calls all templates
CICDTemplate/
  utils/
    security_scan.yml                     ← Checkmarx AST@3, blocks on failure
  ci_stage_build.yml                      ← build, test, Docker push to ACR + publish artifact
  cd_stage_dev.yml                        ← rolling deploy to AKS dev namespace (all branches)
k8s/
  deployment.yml                          ← Kubernetes Deployment (generated once, then maintained by app team)
  service.yml                             ← Kubernetes Service
  configmap.yml                           ← non-secret config
  hpa.yml                                 ← Horizontal Pod Autoscaler
  ingress.yml                             ← Kubernetes Ingress (AGIC, routes /{{APP_NAME}} on ai-sbx.ryansg.com)
```

> **Current scope: Dev only.** Staging and production stages will be added in a future iteration.
> Promote artifact (`promote_artifact.yml`) is also excluded from current scope.

## Trigger
- `cc run generate-pipeline`
- Auto-invoked by `deploy` after `detect-stack`
- Auto-invoked by pre-commit hook when stack files change

---

## No Compute Target Selection

All apps deploy to AKS. The skill does NOT check `compute.target` for routing.
The only runtime-sensitive part is `ci_stage_build.yml` — the correct build steps
(dotnet / node / python / java) are conditioned on `{{RUNTIME}}` and only the
matching steps execute. Everything else (Docker build, ACR push, all CD stages,
K8s manifests) is identical for all runtimes.

---

## Variable Token Reference

### From config.yml (org-level — same for all apps)

| Token                         | config.yml path                           |
|-------------------------------|-------------------------------------------|
| `{{AGENT_POOL}}`              | azure_devops.agent_pool                   |
| `{{SERVICE_CONNECTION}}`      | azure_devops.service_connection           |
| `{{ADO_PROJECT}}`             | azure_devops.project                      |
| `{{ADO_ORG_URL}}`             | azure_devops.org                          |
| `{{ACR_LOGIN_SERVER}}`        | azure.acr_login_server                    |
| `{{AKS_CLUSTER}}`             | azure.aks_cluster                         |
| `{{AKS_RESOURCE_GROUP}}`      | azure.aks_resource_group                  |
| `{{ARTIFACTS_FEED_NAME}}`     | azure_devops.artifacts_feed               |
| `{{CXONE_SERVICE_CONNECTION}}`| security.cxone_service_connection         |
| `{{CXONE_TENANT}}`            | security.cxone_tenant                     |
| `{{SMTP_SERVER}}`             | security.smtp_server                      |
| `{{ALERT_EMAIL_FROM}}`        | security.alert_email_from                 |
| `{{ALERT_EMAIL_TO}}`          | security.alert_email_to                   |

### From stack-manifest.yml (app-level)

| Token                  | manifest path                         |
|------------------------|---------------------------------------|
| `{{APP_NAME}}`         | app_name                              |
| `{{RUNTIME}}`          | runtime  (dotnet/node/python/java)    |
| `{{RUNTIME_VERSION}}`  | version                               |
| `{{SOLUTION_FILE}}`    | build.solution_file  (dotnet)         |
| `{{TEST_PROJECT}}`     | build.test_project   (dotnet)         |
| `{{TEST_RUNSETTINGS}}` | build.test_runsettings (dotnet)       |
| `{{MAJOR_VERSION}}`    | versioning.major (default 1)          |
| `{{MINOR_VERSION}}`    | versioning.minor (default 0)          |

### Derived per-environment (computed by skill)

| Token              | Dev         | Staging         | Production        |
|--------------------|-------------|-----------------|-------------------|
| `{{ENV}}`          | dev         | staging         | production        |
| `{{ENV_NAME}}`     | Development | Staging         | Production        |
| `{{REPLICAS}}`     | 1           | 2               | 3                 |
| `{{MIN_REPLICAS}}` | 1           | 2               | 3                 |
| `{{MAX_REPLICAS}}` | 3           | 5               | 10                |
| `{{CPU_REQUEST}}`  | 100m        | 250m            | 500m              |
| `{{MEMORY_REQUEST}}`| 128Mi      | 256Mi           | 512Mi             |
| `{{CPU_LIMIT}}`    | 250m        | 500m            | 1000m             |
| `{{MEMORY_LIMIT}}` | 256Mi       | 512Mi           | 1Gi               |

---

## Updated config.yml

```yaml
azure:
  subscription_id:      "<uuid>"
  location:             "eastus2"
  acr_login_server:     "acrdevopseus2001.azurecr.io"
  acr_resource_group:   "rg-shared"
  aks_cluster:          "myorg-aks"
  aks_resource_group:   "rg-platform"
  shared_log_analytics: "myorg-law"
  log_analytics_rg:     "rg-monitoring"

azure_devops:
  org:                  "https://dev.azure.com/myorg"
  project:              "MyProject"
  service_connection:   "sc-aipoc_online_nprd_global_ado_01"
  agent_pool:           "Application Build EUS2 Pipelines"
  artifacts_feed:       "ai-core-services"

security:
  cxone_service_connection: "ai-core-service-Checkmarx"
  cxone_tenant:             "ryan-specialty"
  smtp_server:              "smtp.ryansg.com"
  alert_email_from:         "cloud@ryansg.com"
  alert_email_to:           "cloud@ryansg.com"

terraform:
  backend_storage:    "myorgsa"
  backend_container:  "tfstate"
  backend_rg:         "rg-terraform-state"
```

---

## AKS Namespace Convention

Each app gets three namespaces in the shared cluster — one per environment.
All created by `configure-app-infra` before the first deploy:

```
{{APP_NAME}}-dev
{{APP_NAME}}-staging
{{APP_NAME}}-production
```

The pipeline verifies the namespace exists and fails with a clear message
(`Run: cc run configure-app-infra`) if it's missing — not a cryptic kubectl error.

---

## Deploy Strategy per Environment

| Environment | Strategy      | Verify method               | Rollback on failure     |
|-------------|---------------|-----------------------------|-------------------------|
| Dev         | Rolling       | `kubectl rollout status`    | Manual                  |
| Staging     | Rolling       | Rollout status + port-forward health check | Manual   |
| Production  | Canary 20/100 | Rollout status + port-forward health check | Automatic (KubernetesManifest reject) + email alert |

---

## Branch → Namespace → Stage Map

| Branch      | Checkmarx | CI Build | Dev namespace |
|-------------|-----------|----------|---------------|
| Any branch  | ✅        | ✅       | ✅            |
| PR          | ✅        | ✅       | ✅            |

All branches and PRs deploy to the dev namespace. No branch-based routing in the current scope.

---

## k8s/ Manifest Generation

The skill generates starter manifests in `k8s/`. These are committed to the repo
and maintained by the app team — the pipeline applies whatever is in `k8s/` at
the time of the run. The skill only regenerates them if they don't exist yet.

If `k8s/` already exists, the skill skips manifest generation and prints:
  "k8s/ manifests found — skipping generation. Edit manually if needed."

---

## Pipeline Registration — Handled by DevOps Team, Not This Skill

This skill does **not** call `az pipelines create` or modify any ADO pipeline registration.

The ADO pipeline is registered **once by the DevOps team** during repo setup, pointing at
`.azure/pipeline-entry.yml`. That file is committed by DevOps and never touched by this skill:

```yaml
# .azure/pipeline-entry.yml  (DevOps commits this — generate-pipeline never modifies it)
trigger: none
pool:
  name: '{{AGENT_POOL}}'
extends:
  template: ../azure-pipelines.yml   # delegates to the file this skill generates
```

The registration survives indefinitely because:
- `.azure/pipeline-entry.yml` never changes
- `azure-pipelines.yml` can be freely regenerated — the entry file always finds it
- Developers need zero ADO pipeline permissions

**If a pipeline is not yet registered** (repo was set up without the entry file):
contact the DevOps team. The DevOps team registers it via:
```
ADO -> Pipelines -> New pipeline -> Azure Repos Git
  -> select repo -> select .azure/pipeline-entry.yml -> Save (do not run)
```

---

## Example Run

```bash
$ cc run generate-pipeline

📖 Stack: dotnet 8.0 → AKS (all apps deploy to AKS)
📋 Generating 7 pipeline templates + 5 k8s manifests...

   azure-pipelines.yml
   CICDTemplate/utils/security_scan.yml       (tenant: ryan-specialty)
   CICDTemplate/ci_stage_build.yml            (runtime: dotnet 8.0)
   CICDTemplate/cd_stage_dev.yml              (namespace: my-api-dev, all branches)
   k8s/deployment.yml  k8s/service.yml  k8s/configmap.yml  k8s/hpa.yml  k8s/ingress.yml

🚀 Registering: MyProject / repo: my-api
   Pipeline created: my-api-ci-cd (ID: 52)
   https://dev.azure.com/myorg/MyProject/_build?definitionId=52
```

---

## Template Files

All templates live under `templates/` inside this skill's directory. Claude Code reads
each file, substitutes `{{TOKEN}}` values, and writes the result to the correct path
in the application repo. Templates are never modified — tokens are replaced at generation
time only.

```
templates/
  azure-pipelines.yml.tmpl                   → azure-pipelines.yml
  CICDTemplate/
    utils/
      security_scan.yml                      → CICDTemplate/utils/security_scan.yml
      promote_artifact.yml                   → CICDTemplate/utils/promote_artifact.yml
    ci_stage_build.yml                       → CICDTemplate/ci_stage_build.yml
    cd_stage_dev.yml                         → CICDTemplate/cd_stage_dev.yml
    cd_stage_staging.yml                     → CICDTemplate/cd_stage_staging.yml
    cd_stage_production.yml                  → CICDTemplate/cd_stage_production.yml
  k8s/
    deployment.yml.tmpl                      → k8s/deployment.yml  (only if k8s_manifests: generate)
    service.yml.tmpl                         → k8s/service.yml
    configmap.yml.tmpl                       → k8s/configmap.yml
    hpa.yml.tmpl                             → k8s/hpa.yml
    ingress.yml.tmpl                         → k8s/ingress.yml
```

### Rules
- `.azure/pipeline-entry.yml` is **never written by this skill** — it is committed by
  the DevOps team and must not be overwritten. If detected missing, print a warning:
  "pipeline-entry.yml not found — contact DevOps team to register the pipeline."
- CICDTemplate files are **always** written — they are the pipeline definition.
- k8s files are only written when `k8s_manifests: generate` in the stack manifest.
  If `k8s_manifests: existing`, skip them — the app team owns those files.
- If any CICDTemplate file already exists in the repo, show a unified diff and
  prompt "Apply changes? [Y/n]" before overwriting. Never silently overwrite.
- k8s templates are written once and never auto-regenerated — they belong to the
  app team after initial generation.
