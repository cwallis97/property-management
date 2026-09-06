# Security Policy

## Supported versions

PropertyOS is pre-1.0 and ships from a single line of development. Only the
current `main` branch (and whatever is deployed from it) receives security
fixes. There are no long-term support branches.

| Version | Supported |
| ------- | --------- |
| `main` (current) | ✅ |
| anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Report it privately by one of:

- GitHub's private vulnerability reporting: the **"Report a vulnerability"**
  button under this repository's **Security** tab (preferred).
- Email: `security@<TODO: set a monitored address>` — until that mailbox
  exists, contact the repository owner directly.

Please include:

- what you found and where (endpoint, file, or component),
- how to reproduce it (steps, a request, or a minimal proof of concept),
- the impact you believe it has,
- any suggested remediation.

## What to expect

- **Acknowledgement:** within 3 business days.
- **Assessment and triage:** within 10 business days, including a severity
  rating and a target remediation window.
- **Fix and disclosure:** coordinated with you. We ask that you give us a
  reasonable window to remediate before any public disclosure, and we will
  keep you updated on progress.

## Scope

In scope: the PropertyOS API (`server/`), the web client (`client/`), and
their build/CI configuration in this repository.

Out of scope: findings that require a compromised developer machine or
stolen credentials to exploit; automated scanner output without a
demonstrated impact; denial of service through sheer volume against a
single unauthenticated endpoint (rate limiting is in place, but a
distributed flood is an infrastructure concern); social engineering.

## No bug bounty

There is no paid bounty program at this time. Credit in release notes is
offered for valid, responsibly disclosed reports.
