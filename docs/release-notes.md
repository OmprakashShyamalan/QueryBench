# Release Notes

## 2026-03-10

### Documentation Consolidation

- Added centralized documentation hub under `docs/`.
- Added focused guides:
  - `docs/setup.md`
  - `docs/architecture.md`
  - `docs/testing.md`
  - `docs/security.md`
  - `docs/operations.md`
- Added load-report artifact index at `docs/reports/README.md`.
- Updated root `README.md` to route readers to the docs hub.
- Updated `TESTING.md` to point to the canonical testing guide in `docs/testing.md`.

### Why this change

- Reduce fragmentation across multiple top-level documents.
- Make onboarding and maintenance easier with one discoverable docs entrypoint.
- Keep root files lightweight while preserving compatibility with common repository landing behavior.
