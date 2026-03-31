---
name: validate
description: Run the full validation pipeline (lint, knip, typecheck, build, test) and report results.
---

Run the full validation pipeline for this project:

```bash
pnpm validate
```

This runs in order: `biome check` (lint) → `knip` (unused exports/deps) → `tsc --noEmit` (typecheck, including examples) → `tsc -p tsconfig.build.json` (build) → `vitest run` (tests).

If any step fails, stop and report the failure with the relevant output. Suggest a fix if the issue is clear.

If all steps pass, report success with a summary of test count and any warnings.
