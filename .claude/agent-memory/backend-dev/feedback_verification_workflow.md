---
name: feedback-verification-workflow
description: How to build/run a temp binary and verify against a live bang-inventory backend without touching the user's own running server
metadata:
  type: feedback
---

For the bang-inventory Go backend (`/Users/vikasraj/project/theBH/bang-inventory`), tasks in this
project explicitly forbid touching the user's own running server — check for it first
(`lsof -iTCP -sTCP:LISTEN -n -P | grep 808`), and build+run a separate temp binary on a different
port for live verification instead. Observed the user's dev server running on port **8085**
(matches `.env`'s `PORT=8085`) — do not kill or restart that process. Confirmed pattern that works:

```
go build -o /tmp/bang-inventory-verify ./cmd/server
PORT=8099 MYSQL_DSN='root@tcp(127.0.0.1:3306)/bang_inventory?parseTime=true' \
  JWT_SECRET='change-me-to-a-strong-secret' ENVIRONMENT=development \
  /tmp/bang-inventory-verify > /tmp/verify-server.log 2>&1 &
```

It shares the same MySQL DB as the real server (reads/writes against real seeded data are fine —
only the *process* on 8085 is off-limits). Kill by PID after verifying (`kill <pid>`), don't rely
on `%1` job-control syntax in this environment — background `&` inside a Bash tool call isn't a
real shell job for a later `kill %1`, capture and kill the PID directly.

**Why:** A prior session's task note said this "has bitten prior tasks in this session" — a stray
leftover verify binary from an earlier attempt can squat on a port and cause confusing connection
failures on the next verification pass. Always check for and kill stray leftover processes first.

**Login credentials are not stable across DB reseeds** — as of 2026-07-19,
`admin@bangsintered.com` / `DevAdmin123!` worked (source: the `api-regression-tester` agent's own
memory in the backend repo, `.claude/agent-memory/api-regression-tester/feedback_api_quirks.md`,
quirk #19). Token is at `data.token` in the login response. Don't hardcode this password as
permanently correct — re-check that memory file or ask if login fails.

**How to apply:** Before any live-verification step for this backend, run the port/process check,
build a temp binary, run it on an unused port with the same `.env`-derived DSN/secret, verify, then
kill it explicitly by PID and clean up the temp binary file.
