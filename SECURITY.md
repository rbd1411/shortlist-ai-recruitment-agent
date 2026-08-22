# Security and privacy

These projects are demonstration software. Use fictional resumes and transactions for public demos.

## Secrets

- Never commit `.env`, API keys, passwords, tokens, UPI PINs, OTPs, bank credentials, or private deployment identifiers.
- Store production secrets in the hosting provider's secrets or environment-variable settings.
- Rotate a secret immediately if it appears in a commit, screenshot, issue, log, or deployment output.

## Personal data

- Obtain permission before processing resumes or financial statements.
- Define retention and deletion rules before storing files or extracted data.
- Add authentication, role-based access, encryption, audit logs, rate limiting, malware scanning, and legal review before production use.
- Do not use ShortlistAI as the sole basis for employment decisions.
- Do not describe PaisaPilot's unusual-spend flags as proof of fraud.

## Reporting a vulnerability

Do not open a public issue containing private data, credentials, or exploit details. Contact the repository owner privately through the contact method listed on the GitHub profile.
