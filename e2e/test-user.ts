// Local-first model: there is no login, just a single bootstrapped user.
// global.setup.ts seeds the test database with this profile (POST
// /api/user/bootstrap returns 409 if a user already exists, which is fine —
// we only care that *some* user is present so the app reaches the "ready"
// state instead of the onboarding screen).
export const LOCAL_USER = {
  name: process.env.E2E_USER_NAME ?? 'E2E Tester',
  username: process.env.E2E_USER_USERNAME ?? 'e2etester',
};
