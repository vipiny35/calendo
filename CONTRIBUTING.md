# Contributing

Issues and pull requests are welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md).
For security issues, use [private reporting](SECURITY.md).

## Your first pull request

1. Fork the repository and clone your fork. Create a branch for one focused change.
2. Install dependencies with `pnpm install --frozen-lockfile` using the pnpm version
   in `package.json`. Follow [Building](docs/building.md) for native prerequisites.
3. Make the change and update relevant docs. Run `pnpm typecheck`, `pnpm test`,
   and `pnpm build` for code changes.
4. Commit and push your branch, then open a pull request against `main`.
5. Respond to review feedback. The maintainer handles merging and releases.

## What is in scope

Calendo is a month view in the menu bar. It does not sync accounts, fetch
events, or send data off the Mac. A change that adds calendar integration or
a network dependency is a different app.

For anything large, open an issue before writing it.
