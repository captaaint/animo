import { test as base, expect } from '@playwright/test';

// Shared test fixture. The app always renders its `data-testid` hooks, so
// no special E2E mode is needed; specs import `test`/`expect` from here so a
// common setup step can be added in one place.
export const test = base;

export { expect };
