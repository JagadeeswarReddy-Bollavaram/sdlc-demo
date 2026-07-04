# Skill: pre-push-vuln-scan
# Triggered by: cc run pre-push-vuln-scan
# Also installed automatically by: cc run deploy --init

## Purpose

Scan the local repository for security vulnerabilities **before every `git push`** and
optionally auto-remediate fixable issues. The scan runs client-side via a Git pre-push
hook so no code with known-critical vulnerabilities ever reaches Azure Repos.

---

## Prerequisites

The deploy skill checks these before installing the hook; the same list applies when
running standalone:

| Tool | Purpose | Install |
|------|---------|---------|
| Node.js ≥ 18 | npm audit (JS/TS repos) | nodejs.org |
| Python ≥ 3.9 | pip-audit (.py repos) | python.org |
| Trivy | Container & IaC scanning | `winget install AquaSecurity.Trivy` |
| Git ≥ 2.9 | Hook support | git-scm.com |

Trivy must be on PATH. Verify: `trivy --version`

---

## What Gets Scanned

| Scanner | Trigger files | Findings reported |
|---------|--------------|-------------------|
| `npm audit --audit-level=high` | `package.json` / `package-lock.json` | HIGH + CRITICAL JS deps |
| `pip-audit` | `requirements.txt` / `Pipfile.lock` / `pyproject.toml` | All severities |
| `trivy fs --severity HIGH,CRITICAL` | Always (IaC, Dockerfiles, secrets) | HIGH + CRITICAL |

All three scanners run in parallel. The hook blocks the push only when **CRITICAL** findings
remain after auto-fix. HIGH findings emit a warning but do not block.

---

## Auto-Remediation

When `vuln_scan.auto_fix: true` is set in `.claude/config.yml` (default: `true`):

1. **JS/TS** — runs `npm audit fix` then re-scans. Force-fix (`npm audit fix --force`)
   is NOT used automatically because it may introduce breaking changes; it is offered
   interactively.
2. **Python** — updates pinned versions in `requirements.txt` to the patched release
   using `pip-audit --fix`. Does not touch transitive deps not listed in the file.
3. **Trivy IaC / Dockerfile** — auto-fix is not possible; findings are written to
   `.claude/vuln-report-<timestamp>.json` for developer review.

After auto-fix the skill re-runs all scanners. If CRITICALs remain the push is blocked
and the developer is prompted to review `.claude/vuln-report-<timestamp>.json`.

---

## Skill Steps

```
1. detect-runtime        — determine which scanners apply (reuses detect-stack output)
2. run-scanners          — parallel execution of applicable scanners
3. parse-results         — normalise findings into unified JSON schema
4. auto-fix              — attempt remediation (if enabled in config.yml)
5. re-scan               — verify fix worked (skipped if no fixes were applied)
6. gate                  — exit 0 (allow push) or exit 1 (block push) based on CRITICAL count
7. report                — write .claude/vuln-report-<timestamp>.json; print summary to stdout
```

---

## Configuration (.claude/config.yml additions)

```yaml
vuln_scan:
  enabled: true             # set false to disable hook entirely (not recommended)
  auto_fix: true            # attempt npm audit fix / pip-audit --fix before blocking
  block_on: critical        # critical | high | medium  (default: critical)
  exclude_paths:            # paths Trivy will skip
    - "test/**"
    - "**/*.test.ts"
  trivy_ignore_file: ".trivyignore"   # optional; Trivy reads this natively
  report_dir: ".claude"     # where vuln-report-*.json files are written
```

---

## Installing the Hook (manual / standalone)

```bash
# Installs .git/hooks/pre-push and marks it executable
cc run pre-push-vuln-scan --install-hook

# Verify
cat .git/hooks/pre-push
```

The hook is also installed automatically when running `cc run deploy --init` — no manual
step needed for new repos.

---

## Bypassing the Hook (emergency only)

```bash
git push --no-verify
```

Using `--no-verify` is logged to `.claude/hook-bypass.log` with timestamp and username.
The ADO pipeline runs a full Checkmarx scan regardless, so bypassed pushes are still
caught server-side.

---

## Report Schema (.claude/vuln-report-<timestamp>.json)

```json
{
  "scan_time": "2026-06-22T15:00:00Z",
  "repo": "my-app",
  "commit": "abc1234",
  "blocked": false,
  "scanners": {
    "npm_audit": { "critical": 0, "high": 1, "fixed": 1, "remaining": 0 },
    "pip_audit": { "critical": 0, "high": 0, "fixed": 0, "remaining": 0 },
    "trivy":     { "critical": 0, "high": 2, "fixed": 0, "remaining": 2 }
  },
  "findings": [
    {
      "scanner": "trivy",
      "severity": "HIGH",
      "target": "Dockerfile",
      "id": "CVE-2024-12345",
      "title": "Example vuln in base image",
      "fixed_version": "3.2.1",
      "auto_fixed": false
    }
  ]
}
```

---

## Ongoing Operations

| Task | Action |
|------|--------|
| Update scan thresholds | Edit `vuln_scan.block_on` in `.claude/config.yml` and raise a PR to the org config repo |
| Add a path exclusion | Add to `vuln_scan.exclude_paths` in config.yml |
| Suppress a false-positive CVE | Add the CVE ID to `.trivyignore` in the repo root |
| Update Trivy DB manually | `trivy image --download-db-only` |
| Remove the hook | `rm .git/hooks/pre-push` |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hook not running on push | Hook file not executable | `chmod +x .git/hooks/pre-push` |
| `trivy: command not found` | Trivy not on PATH | Add Trivy install dir to PATH; re-run `cc run pre-push-vuln-scan --install-hook` |
| `npm audit` exits with code 1 even after fix | Unfixable advisory requires manual semver bump | Review `.claude/vuln-report-*.json`; update dependency manually |
| Hook runs but never blocks | `vuln_scan.enabled: false` in config.yml | Set to `true` |
| Scan takes > 60 s on large monorepo | Trivy scanning all paths | Add large generated dirs (e.g. `node_modules`) to `vuln_scan.exclude_paths` |
