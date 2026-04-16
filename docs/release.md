# Release path

Starglass should ship as a small, truthful package. Every release should prove five things before publishing:

1. the code typechecks
2. the tests pass
3. the build output is current
4. the packed tarball contains only intended production files
5. the packed tarball can be installed and imported from a clean temp project

## Automated verification

The repository release discipline is encoded in two places:

- `npm run verify:packaging` checks the tarball file list and performs a clean install/import smoke test
- `.github/workflows/release-discipline.yml` runs check, test, build, pack, and packaging verification on pushes and pull requests

## Local release checklist

Run these commands from the repo root:

```bash
npm ci
npm run check
npm test
npm run build
npm pack --json
npm run verify:packaging
```

If any step fails, do not publish.

## Expected package contents

The published tarball is intentionally limited to:

- `README.md`
- `package.json`
- `dist/**`

Examples, tests, OpenSpec files, raw source, and local tooling must stay out of the published artifact unless the package contract changes intentionally. If that contract changes, update `package.json`, `scripts/verify-packaging.mjs`, and this document together.

## Publishing notes

- Make sure the version in `package.json` matches the intended release.
- Prefer publishing from a clean working tree.
- Treat tarball verification as the truth, not assumptions about `.gitignore` or npm defaults.
- After publishing, spot-check the package with `npm view starglass files --json` or by downloading the published tarball when practical.
