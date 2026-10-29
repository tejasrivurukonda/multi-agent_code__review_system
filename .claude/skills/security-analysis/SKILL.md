---
name: security-analysis
description: Security review checklist for JavaScript/TypeScript code covering OWASP Top 10 style issues. Use when reviewing code that handles user input, authentication, payments, subscriptions, queries, files or secrets.
---

# Security Analysis Checklist

When reviewing code, check each item and report only issues you can point to in the code.

## Input and output
- Untrusted input rendered with innerHTML, document.write or eval (XSS, code injection).
- String-concatenated SQL or shell commands (injection).
- Missing validation of types, lengths and ranges on user input.

## Authentication and authorization
- Missing permission checks on sensitive actions (premium features, admin actions).
- Client-side-only enforcement of access rules or subscription status.
- Weak or hardcoded credentials, tokens or API keys.

## Payments and subscriptions
- Prices, plan names or entitlements trusted from the client.
- Missing verification of payment status before granting access.
- Card or personal data stored or logged in plain text.

## Data handling
- Secrets or personal data in logs, URLs or local storage.
- Insecure randomness (Math.random) used for tokens or ids.
- Errors that leak internal details.

## Severity hints
Exploitable injection, auth bypass or secret exposure = critical/high. Missing validation without a clear exploit = medium. Hardening suggestions = low.