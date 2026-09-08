# packages/shared

Shared product contracts between `apps/web` and `services/api`.

- `task_status.json` — task states, artifact names, upload extensions
- `agent_contract.json` — Agent session/turn statuses, event types, tools, limits

Later: generate TypeScript + Pydantic from one schema. For now, keep this JSON as the source of truth and mirror values in code.
