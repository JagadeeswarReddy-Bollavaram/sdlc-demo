---
name: unit-test-generator
description: >
  Automatically generates unit tests for a user's project based on detected runtime and source code.
  This skill is integrated into cc run deploy --init and runs automatically as part of onboarding —
  it is NOT a standalone command. Also trigger when the user asks to "add more tests", "update tests
  after code changes", "fix failing tests", "add test coverage", or "write tests for this
  function/class/module". Works with .NET (xUnit), Node.js/TypeScript (Jest), Python (pytest),
  and Java (JUnit 5). Never skip this skill when the user's intent involves testing.
---

# Unit Test Generator Skill

Generates idiomatic, runnable unit tests as part of `cc run deploy --init`, and on-demand when
developers need additional or updated tests. Integrated into the Claude Code × Azure DevOps pipeline.

> **Pipeline trigger: push to `main` branch.**
> Tests must exist and pass locally before `--init` completes. The pipeline runs immediately on
> push to `main` — there is no feature branch buffer.

---

## When This Skill Runs

### Integrated into `cc run deploy --init` (automatic)

The `--init` flow calls this skill at Step 4 automatically:

1. Read `config.yml`
2. `detect-stack` — runtime identified
3. Read codebase — Claude Code analyses source files
4. **→ THIS SKILL:**
   - Step 2: Update `package.json` with `jest` + `jest-junit`, run `npm install`
   - Step 3: Inventory source files
   - Step 4: Generate test files
   - Step 5: Verify tests pass locally
5. generate-pipeline — pipeline templates and k8s manifests
6. setup-git-hooks
7. git commit + push to `main` → build → tests → Checkmarx → deploy

### On-demand (developer request)

Run when a developer asks to add, update, or fix tests after initial onboarding.

---

## Step 1 — Detect Runtime & Test Framework

Runtime is already known from `detect-stack` when called from `--init`. On standalone runs,
check project files directly.

| Runtime detected      | Default framework | Test file convention          |
|-----------------------|-------------------|-------------------------------|
| `dotnet`              | xUnit             | `*.Tests/*.cs`                |
| `node` / `typescript` | Jest              | `*.test.ts` / `*.spec.ts`     |
| `python`              | pytest            | `test_*.py` / `*_test.py`     |
| `java`                | JUnit 5           | `*Test.java`                  |

If a test framework is **already present** (check `package.json`, `*.csproj`, `pom.xml`,
`pyproject.toml`), use the existing one — never introduce a second framework.

---

## Step 2 — Update Project File with Required Test Packages

Before generating test files, ensure all required test dependencies are declared in the project
file and installed locally. This prevents pipeline failures caused by missing reporters or runners.

### Node.js — package.json

Add the following to `devDependencies` if not already present, then run `npm install`:

| Package      | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| `jest`       | Test runner                                                             |
| `jest-junit` | JUnit XML reporter — required by `PublishTestResults@2` in the pipeline |

```json
"devDependencies": {
  "jest":       "^29.7.0",
  "jest-junit": "^16.0.0"
}
```

Also add/update the `jest` config block and `test` script in `package.json`:

```json
"scripts": {
  "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --passWithNoTests"
},
"jest": {
  "testEnvironment": "node",
  "transform": {}
}
```

> **Why jest-junit is mandatory:** The pipeline's `ci_stage_build.yml` runs Jest with
> `--reporters=jest-junit` to produce a JUnit XML file consumed by `PublishTestResults@2`.
> If `jest-junit` is missing from `devDependencies`, `npm ci` on the agent will not install
> it and the test stage fails with `Could not resolve a module for a custom reporter`.

After updating `package.json`, run `npm install` to generate/update `package-lock.json`
and commit both files.

### .NET — no action needed

xUnit and its runner are declared in the `.csproj` file. No separate install step.

### Python — no action needed

pytest is installed by the pipeline via `pip install pytest pytest-cov`. No `requirements.txt`
change needed unless the project uses additional pytest plugins.

### Java — no action needed

JUnit 5 is declared in `pom.xml`. The Maven build handles the install.

---

## Step 4 — Inventory Source Files

Scan for source files to test. Priority order:

1. Files explicitly mentioned by the user (on-demand runs)
2. All public classes / exported functions (during `--init`)
3. Files changed in the last commit (`git diff --name-only HEAD~1`) on on-demand runs

Ignore: `bin/`, `obj/`, `node_modules/`, `dist/`, `migrations/`, auto-generated files.

---

## Step 5 — Generate Tests

For each source file, produce a test file that:

- **Covers the happy path** for every public method / exported function
- **Covers at least one failure / edge case** (null input, empty collection, boundary value)
- **Mocks all external dependencies** (database, HTTP clients, file I/O) — never hit real services
- **Uses Arrange / Act / Assert** with clear comments
- **Naming convention**: `MethodName_Scenario_ExpectedResult`
- **Always includes a `/health` endpoint test** asserting HTTP 200 — this endpoint is checked
  by the canary deployment's `postRouteTraffic` health check; a missing 200 silently stalls
  production promotions at 20%

### Framework patterns

#### .NET — xUnit
```csharp
public class OrderServiceTests
{
    private readonly Mock<IOrderRepository> _repoMock = new();

    [Fact]
    public void PlaceOrder_ValidRequest_ReturnsConfirmationId()
    {
        // Arrange
        _repoMock.Setup(r => r.Save(It.IsAny<Order>())).Returns(Guid.NewGuid());
        var svc = new OrderService(_repoMock.Object);
        // Act
        var result = svc.PlaceOrder(new OrderRequest { ProductId = 1, Qty = 2 });
        // Assert
        Assert.NotNull(result.ConfirmationId);
    }

    [Fact]
    public void PlaceOrder_NullRequest_ThrowsArgumentNullException() =>
        Assert.Throws<ArgumentNullException>(() =>
            new OrderService(_repoMock.Object).PlaceOrder(null));
}
```

#### Node.js / TypeScript — Jest
```typescript
import { OrderService } from '../src/orderService';
import { OrderRepository } from '../src/orderRepository';
jest.mock('../src/orderRepository');

describe('OrderService', () => {
  let service: OrderService;
  let repoMock: jest.Mocked<OrderRepository>;

  beforeEach(() => {
    repoMock = new OrderRepository() as jest.Mocked<OrderRepository>;
    service = new OrderService(repoMock);
  });

  it('placeOrder_validRequest_returnsConfirmationId', async () => {
    repoMock.save.mockResolvedValue({ id: 'abc-123' });
    const result = await service.placeOrder({ productId: 1, qty: 2 });
    expect(result.confirmationId).toBe('abc-123');
  });

  it('placeOrder_nullRequest_throwsError', async () => {
    await expect(service.placeOrder(null)).rejects.toThrow();
  });
});
```

#### Python — pytest
```python
from unittest.mock import MagicMock
import pytest
from src.order_service import OrderService

@pytest.fixture
def service():
    repo = MagicMock()
    repo.save.return_value = "conf-001"
    return OrderService(repo)

def test_place_order_valid_request_returns_confirmation_id(service):
    result = service.place_order(product_id=1, qty=2)
    assert result.confirmation_id == "conf-001"

def test_place_order_none_request_raises_value_error(service):
    with pytest.raises(ValueError):
        service.place_order(None)
```

#### Java — JUnit 5
```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock private OrderRepository repo;
    @InjectMocks private OrderService service;

    @Test
    void placeOrder_validRequest_returnsConfirmationId() {
        when(repo.save(any())).thenReturn(UUID.randomUUID());
        var result = service.placeOrder(new OrderRequest(1, 2));
        assertNotNull(result.getConfirmationId());
    }

    @Test
    void placeOrder_nullRequest_throwsNullPointerException() {
        assertThrows(NullPointerException.class, () -> service.placeOrder(null));
    }
}
```

---

## Step 6 — Write Test Files to Disk

Use the project's existing test directory, or create the standard one:

| Runtime   | Default test directory              |
|-----------|-------------------------------------|
| dotnet    | `tests/<ProjectName>.Tests/`        |
| node/ts   | `src/__tests__/` or alongside src   |
| python    | `tests/`                            |
| java      | `src/test/java/`                    |

Never overwrite existing test files — append `_generated` suffix and notify the developer to review.

---

## Step 7 — Verify Tests Run Locally

**This step is mandatory when called from `--init`.** Do not register the pipeline if it fails.

| Runtime   | Verify command                    |
|-----------|-----------------------------------|
| dotnet    | `dotnet test --no-build`          |
| node/ts   | `npx jest --passWithNoTests`      |
| python    | `pytest --collect-only`           |
| java      | `mvn test -Dsurefire.failIfNoSpecifiedTests=false` |

If tests fail due to missing mocks or imports, fix them before proceeding. Report pass/fail counts
to the developer.

If verification fails during `--init`, block pipeline registration and surface a clear error:
> "Unit test generation failed — fix the errors above before pushing to main. The pipeline
> triggers on main immediately and will fail without passing tests."

---

## Step 8 — CI Integration (--init only)

The `ci_stage_build.yml` template already includes a test stage. No extra action needed.

The Checkmarx scan (`security_scan.yml`) runs **after** the build/test stage — tests must pass
before security scanning proceeds.

---

## Edge Cases

- **Multiple project files** (e.g. both `package.json` and `.csproj`): use `azure.yaml runtime:`
  if present; otherwise ask the developer which runtime to target.
- **No public methods found**: report and ask the developer to point to the specific file.
- **Legacy code with no DI**: generate what's possible; flag constructors that need refactoring
  for testability.
- **On-demand after --init**: skip Steps 5–6 (pipeline already registered); just write files
  and verify locally.
