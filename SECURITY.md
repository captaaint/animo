# Security Policy

## Supported versions

Animo is in an early alpha phase. Only the latest released version on `main`
receives security fixes. Older tagged releases are not patched.

| Version  | Supported          |
| -------- | ------------------ |
| latest   | :white_check_mark: |
| < latest | :x:                |

## Reporting a vulnerability

**Please do not file public GitHub Issues for security vulnerabilities.**

Use one of these private channels instead:

1. **Preferred — GitHub Security Advisories**: open a private report via the
   "Report a vulnerability" button on the repository's Security tab.
2. **Email**: <tamaskapitany@pm.me> with the subject prefix
   `[animo-security]`. Include:
   - A description of the vulnerability
   - Reproduction steps (minimal proof-of-concept ideal)
   - Impact assessment from your perspective
   - Affected version(s) and platform(s)

### Response expectations

- **Acknowledgement**: within 5 business days of receipt
- **Initial assessment**: within 14 days
- **Fix timeline**: depends on severity, but I aim for a patched release
  within 30 days of confirmation for high-severity issues

### Coordinated disclosure

Once a fix lands and a release is published, I will publish a security
advisory crediting the reporter (unless anonymity is requested). If a CVE
is appropriate, I will request one through GitHub.

## Scope

In scope:

- The `animo-api` HTTP server (authentication, authorisation, SQL handling,
  request parsing)
- The web SPA (XSS, CSRF, sensitive-data leakage to the browser)
- The Tauri desktop shell (file-system permissions, IPC boundaries,
  bundled update integrity)
- Build / release pipeline integrity (signed commits, artifact checksums)

Out of scope:

- Social engineering of project maintainers
- Physical attacks on the user's machine
- Denial of service via resource exhaustion (rate limiting is best-effort)
- Issues in third-party dependencies that have not yet been patched
  upstream — please report those to the upstream project first

## Hardening recommendations for operators

Animo is an on-prem app. When deploying `animo-api` outside of localhost:

- Always serve behind TLS (e.g. via a reverse proxy like Caddy or nginx)
- Set a strong JWT secret in the API config; never use the default
- Keep the SQLite database file off network shares
- Run the API as a non-root user with restricted filesystem access
- Apply OS updates promptly — Animo relies on the system's TLS stack

## Acknowledgements

Thanks to all reporters who responsibly disclose security issues.
