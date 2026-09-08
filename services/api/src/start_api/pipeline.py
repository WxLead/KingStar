"""Parse / translate job entry points shared by HTTP and Agent tools.

The heavy workers still live in `start_api.main` (`_run_task`, `_run_translate_only`).
Agent tools call the `_agent_create_*` helpers wired via `configure_agent` so both
surfaces enqueue the same pipeline without duplicating MinerU / translate logic.
"""
