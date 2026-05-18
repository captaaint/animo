export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL ?? 'e2e@example.test',
  password: process.env.E2E_USER_PASSWORD ?? 'e2e-password-1',
  name: process.env.E2E_USER_NAME ?? 'E2E Tester',
};
