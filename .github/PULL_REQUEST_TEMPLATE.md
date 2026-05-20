<!--
Thanks for the PR. The points below aren't gates — they're a checklist
to help me (and future-me) review faster. Cross out anything that doesn't
apply rather than leaving it blank.
-->

## Summary

<!-- One paragraph: what changes, and why. -->

## Linked issue

<!-- Closes #N, refs #N, or "n/a" if there is no tracking issue yet. -->

## Type

<!-- Tick whichever applies. -->

- [ ] `feat` — new user-visible feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code change without behaviour change
- [ ] `docs` — documentation only
- [ ] `chore` — tooling, CI, dependencies
- [ ] `test` — tests only

## How I verified it

<!--
Drop the commands / screens you used.
Examples:
  - `cargo test --workspace`
  - `npm run e2e -- tests/calendar.spec.ts`
  - Manual: registered + signed in + ran the stopwatch for 5 minutes
-->

## Checklist

- [ ] Pre-commit hook is installed locally (`scripts/install-hooks.sh`) — branch passes `cargo fmt` and the secret-scan.
- [ ] CHANGELOG.md updated under `[Unreleased]` if the change is user-visible.
- [ ] Conventional Commit prefix in the title (`feat:`, `fix:`, `chore:`, ...).
- [ ] No `testId` props added to XMLUI markup (see CONTRIBUTING).
- [ ] No secrets / personal data / `.env` files staged.
