# Skill: setup-git-hooks

## Purpose
Install Git hooks that automate pipeline file regeneration on commit and validate
YAML + secrets before push. No IaC validation — there are no Terraform or Bicep
files in application repos.

## Trigger
- `cc run setup-git-hooks`
- Auto-invoked by `deploy --init`

---

## Hooks Installed

### `pre-commit`

Runs on every `git commit`. Re-runs `detect-stack` when project files change.
If the stack manifest changes, regenerates pipeline templates and k8s manifests
and stages the updated files automatically.

```bash
#!/bin/bash
set -e

echo "🔍 [pre-commit] Checking for stack changes..."

# Files that signal a possible stack change
STACK_TRIGGER_FILES=(
  "*.csproj" "*.sln" "Directory.Build.props"
  "package.json" "package-lock.json"
  "requirements.txt" "pyproject.toml" "setup.py"
  "pom.xml" "build.gradle"
  "go.mod"
  "Dockerfile"
)

CHANGED=false
for pattern in "${STACK_TRIGGER_FILES[@]}"; do
  if git diff --cached --name-only | grep -qE "$pattern"; then
    CHANGED=true
    break
  fi
done

if [ "$CHANGED" = true ]; then
  echo "📦 Stack files changed — re-running detect-stack..."
  cc run detect-stack --quiet

  if [ "$STACK_CHANGED" = "true" ]; then
    echo "⚙️  Manifest updated — regenerating pipeline templates and k8s manifests..."
    cc run generate-pipeline --quiet

    # Stage regenerated files
    git add azure-pipelines.yml
    git add CICDTemplate/
    git add k8s/
    git add .claude/stack-manifest.yml

    echo "✅ Generated files staged."
  fi
fi

# ── Config freshness check ───────────────────────────────────────────────
# Warn if config.yml is behind the org config repo.
# Never auto-updates here — auto-update only happens in cc run deploy --init.
if [ -f ".claude/config.yml" ]; then
  CONFIG_REPO="{{ORG_CONFIG_REPO_URL}}"
  REMOTE_HASH=$(git archive --remote="$CONFIG_REPO" main ".claude/config.yml" \
    2>/dev/null | tar -xO | sha256sum | awk '{print $1}')
  LOCAL_HASH=$(sha256sum ".claude/config.yml" | awk '{print $1}')
  if [ -n "$REMOTE_HASH" ] && [ "$REMOTE_HASH" != "$LOCAL_HASH" ]; then
    echo "⚠️  config.yml is outdated — org config has changed."
    echo "   Run: cc run deploy --init  to fetch the latest version."
  fi
fi

echo "✅ [pre-commit] Done."
```

---

### `pre-push`

Runs before `git push`. Validates pipeline YAML, k8s manifests, runs a dependency
vulnerability scan, and scans for secrets. No Terraform or Bicep validation —
there are no IaC files in app repos.

```bash
#!/bin/bash
set -e

echo "🔍 [pre-push] Validating before push..."

# ── Validate Azure Pipelines YAML ─────────────────────────────────────────
if [ -f "azure-pipelines.yml" ]; then
  echo "  Validating azure-pipelines.yml..."
  ADO_ORG=$(grep 'org:' .claude/config.yml | awk '{print $2}')
  ADO_PROJECT=$(grep 'project:' .claude/config.yml | awk '{print $2}')
  az pipelines runs queue \
    --org "$ADO_ORG" \
    --project "$ADO_PROJECT" \
    --dry-run \
    --yaml-path azure-pipelines.yml 2>/dev/null \
    && echo "  ✅ Pipeline YAML valid" \
    || echo "  ⚠️  Pipeline YAML warning (continuing)"
fi

# ── Validate Kubernetes manifests ─────────────────────────────────────────
if [ -d "k8s" ]; then
  echo "  Validating k8s manifests..."
  # kubectl --dry-run=client requires kubelogin for AAD-enabled private AKS clusters.
  # Fall back to YAML syntax check when kubelogin is not installed locally.
  if command -v kubectl &>/dev/null && command -v kubelogin &>/dev/null; then
    kubectl apply --dry-run=client -f k8s/ \
      && echo "  ✅ k8s manifests valid" \
      || { echo "  ❌ k8s manifest validation failed"; exit 1; }
  elif command -v node &>/dev/null; then
    for f in k8s/*.yml; do
      node -e "
        const fs = require('fs');
        const lines = fs.readFileSync('$f','utf8').split('\n');
        let ok = true;
        lines.forEach((l,i) => { if (/^\t/.test(l)) { console.error('Tab indent at line '+(i+1)); ok=false; } });
        if (!ok) process.exit(1);
        console.log('  ✅ $f');
      " || { echo "  ❌ $f — invalid YAML"; exit 1; }
    done
  else
    echo "  ⚠️  No YAML validator available — skipping k8s validation (pipeline will validate)"
  fi
fi

# ── Dependency vulnerability scan ─────────────────────────────────────────
# Blocks on high/critical findings. Warns and continues if registry is unreachable.
echo "  Scanning dependencies for vulnerabilities..."

# Node.js — npm audit
if [ -f "package.json" ] && command -v npm &>/dev/null; then
  AUDIT_RESULT=$(npm audit --audit-level=high 2>&1)
  AUDIT_EXIT=$?
  if [ $AUDIT_EXIT -eq 0 ]; then
    echo "  ✅ npm audit passed — no high/critical vulnerabilities"
  elif echo "$AUDIT_RESULT" | grep -qiE "ECONNREFUSED|network|ETIMEDOUT|426|registry|Upgrade Required"; then
    echo "  ⚠️  npm audit registry unreachable — skipping (run manually when connected)"
  else
    echo "  ❌ npm audit found high/critical vulnerabilities — push blocked"
    echo "$AUDIT_RESULT"
    exit 1
  fi
fi

# .NET — dotnet list package --vulnerable
if ls ./*.csproj ./*.sln 2>/dev/null | head -1 | grep -q . && command -v dotnet &>/dev/null; then
  VULN_OUTPUT=$(dotnet list package --vulnerable 2>/dev/null)
  if echo "$VULN_OUTPUT" | grep -qiE "critical|high"; then
    echo "  ❌ dotnet found high/critical vulnerable packages — push blocked"
    echo "$VULN_OUTPUT"
    exit 1
  else
    echo "  ✅ dotnet package audit passed"
  fi
fi

# Python — pip-audit (preferred) or safety
if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
  if command -v pip-audit &>/dev/null; then
    pip-audit --desc 2>/dev/null \
      && echo "  ✅ pip-audit passed" \
      || { echo "  ❌ pip-audit found vulnerabilities — push blocked"; exit 1; }
  elif command -v safety &>/dev/null; then
    safety check 2>/dev/null \
      && echo "  ✅ safety check passed" \
      || { echo "  ❌ safety found vulnerabilities — push blocked"; exit 1; }
  else
    echo "  ⚠️  No Python vulnerability scanner found (install pip-audit for coverage)"
  fi
fi

# ── Secrets scan ──────────────────────────────────────────────────────────
echo "  Scanning for secrets..."
if command -v gitleaks &>/dev/null; then
  gitleaks detect --source . --no-banner 2>/dev/null \
    && echo "  ✅ No secrets found" \
    || { echo "  ❌ Secrets detected — push blocked"; exit 1; }
else
  if git diff HEAD -- . | grep -iE "(password|secret|apikey|connectionstring)\s*=\s*['\"][^'\"]{8,}"; then
    echo "  ❌ Potential secrets in diff — push blocked"
    exit 1
  fi
  echo "  ✅ Basic secrets scan passed (install gitleaks for full coverage)"
fi

echo "✅ [pre-push] All checks passed."
```

---

### `commit-msg`

Enforces conventional commit format. The `infra` type is removed — there are no
IaC changes in application repos.

```bash
#!/bin/bash
COMMIT_MSG=$(cat "$1")
PATTERN="^(feat|fix|chore|docs|refactor|test|ci|deploy|k8s)(\(.+\))?: .{1,100}$"

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
  echo "❌ Commit message format invalid."
  echo "   Required: <type>(<scope>): <description>"
  echo "   Types: feat|fix|chore|docs|refactor|test|ci|deploy|k8s"
  echo "   Examples:"
  echo "     feat(api): add health check endpoint"
  echo "     ci: update pipeline triggers"
  echo "     k8s: increase production replica count"
  exit 1
fi
```

---

## Installation

```bash
cp .claude/hooks/pre-commit  .git/hooks/pre-commit
cp .claude/hooks/pre-push    .git/hooks/pre-push
cp .claude/hooks/commit-msg  .git/hooks/commit-msg
chmod +x .git/hooks/pre-commit .git/hooks/pre-push .git/hooks/commit-msg
```

## Bypassing (Emergency Only)

```bash
git commit --no-verify -m "chore: emergency fix — bypassed hooks"
git push --no-verify origin main
```

---

## Example Run

```bash
$ cc run setup-git-hooks

📁 Installing hooks → .git/hooks/
   ✅ pre-commit  (stack detection + pipeline regeneration)
   ✅ pre-push    (YAML lint + k8s validation + vulnerability scan + secrets scan)
   ✅ commit-msg  (conventional commit format)

✅ Hooks installed.
```
