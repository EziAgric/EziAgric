# Quick Start: Running Tests & Viewing Documentation

## Installation

```bash
cd backend

# Install all dependencies (including Jest)
npm install
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
# Schema formatter tests (80+ tests)
npm test -- src/__tests__/schemas.formatter.test.ts

# Date filter & pagination tests (60+ tests)
npm test -- src/__tests__/dateFilter.pagination.test.ts
```

### Watch Mode (Re-run on Changes)

```bash
npm test -- --watch
```

### Generate Coverage Report

```bash
npm test -- --coverage
```

Coverage report will be available in `coverage/` directory.

## Understanding Test Output

### Passed Test Example

```
✓ should parse valid ISO 8601 dates (5ms)
  ✓ should handle date with milliseconds (2ms)
  ✓ should handle dates with timezone offsets (3ms)
```

### Failed Test Example

```
✕ should reject invalid seller address (8ms)
  Expected: false
  Received: true
```

## Test Structure

### Each Test File Contains

**schemas.formatter.test.ts:**

- Amount formatting validation
- Stellar public key validation
- Loss basis points validation and sum constraint
- Pagination parameter parsing
- Status filtering
- Sort field parsing
- Dispute schema validation

**dateFilter.pagination.test.ts:**

- Date parsing and normalization
- Timestamp handling
- Range filtering (before, after, range)
- Offset-based pagination
- Limit validation (min/max bounds)
- Sort ordering (ascending/descending)
- Combined filtering + pagination

## Documentation Files

### 1. NEUROWEALTH_API_CONTRACT.md

API reference for integration

**Key sections:**

- Authentication (JWT Bearer token)
- Endpoints (trades, disputes, evidence, audit)
- Request/response schemas
- Error codes and handling
- Rate limiting
- Integration examples (cURL, JavaScript)

**When to use:**

- Building API integration tests
- Frontend integration
- API client library development

### 2. ARCHITECTURE_AND_DATA_FLOW.md

System design and implementation reference

**Key sections:**

- Provider architecture and service layers
- Data flow for 4 main workflows
- Stellar testnet configuration
- Middleware pipeline
- Observability/tracing setup
- Database schema
- Performance scaling
- Debugging tips

**When to use:**

- Understanding backend architecture
- Onboarding new developers
- Deployment decisions
- Debugging production issues

## Common Test Commands

### Run tests with specific name

```bash
npm test -- -t "should parse valid ISO"
```

### Run tests matching pattern

```bash
npm test -- --testNamePattern="formatting"
```

### Clear test cache

```bash
npm test -- --clearCache
```

### Run tests without watching

```bash
npm test -- --run
```

## Test Coverage Expectations

The project requires 70%+ coverage across all metrics:

- Lines: 70%+
- Statements: 70%+
- Functions: 65%+
- Branches: 60%+

Run `npm test -- --coverage` to see current coverage.

## Troubleshooting

### Jest not found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Tests fail with type errors

```bash
# Ensure @types/jest is installed
npm install --save-dev @types/jest
```

### Port already in use (if running dev server)

```bash
# Tests run in Node environment, not in dev server
# No ports needed for unit tests
npm test
```

### Module not found errors

```bash
# Ensure all dependencies are installed
npm install
npm run build  # May need to build first
```

## Test Examples

### Testing Amount Formatting

```typescript
// Valid: String with decimals
{
  amountUsdc: "1000.50";
} // ✓ Pass

// Valid: Number
{
  amountUsdc: 1000.5;
} // ✓ Pass (converted to string)

// Invalid: More than 7 decimals
{
  amountUsdc: "1000.12345678";
} // ✗ Fail

// Invalid: Negative
{
  amountUsdc: -1000;
} // ✗ Fail
```

### Testing Pagination

```typescript
// Valid: Default pagination
{ }  // page=1, limit=20 (defaults)

// Valid: Custom pagination
{ page: "3", limit: "50" }  // Converted to numbers

// Invalid: Page too low
{ page: 0 }  // ✗ Fail

// Invalid: Limit exceeds max
{ limit: 101 }  // ✗ Fail (max 100)
```

### Testing Date Filtering

```typescript
// Valid: ISO 8601 date
parseIsoDate("2026-06-24T10:30:00Z"); // ✓ Pass

// Valid: With milliseconds
parseIsoDate("2026-06-24T10:30:00.123Z"); // ✓ Pass

// Valid: With timezone
parseIsoDate("2026-06-24T10:30:00+02:00"); // ✓ Pass

// Invalid: Malformed
new Date("not-a-date"); // Returns invalid date
```

## Continuous Integration

Tests are run automatically on:

- Pull requests
- Commits to main/develop branches
- Pre-deployment checks

CI runs via GitHub Actions (`.github/workflows/ci.yml`)

## Performance

Typical test execution time:

- `schemas.formatter.test.ts`: ~500ms (80 tests)
- `dateFilter.pagination.test.ts`: ~400ms (60 tests)
- **Total**: ~1s for all 140 tests

## Next Steps

1. **Run tests locally**: `npm test`
2. **Review failing tests**: Check test output for details
3. **Read documentation**: Start with `NEUROWEALTH_API_CONTRACT.md`
4. **Add new tests**: Use existing tests as templates
5. **Check coverage**: `npm test -- --coverage`

## Support

For questions about:

- **Tests**: See test comments in each file
- **API**: See `NEUROWEALTH_API_CONTRACT.md`
- **Architecture**: See `ARCHITECTURE_AND_DATA_FLOW.md`
- **Stellar**: See Stellar testnet section in architecture docs
