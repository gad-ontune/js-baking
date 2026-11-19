"""Configuration guardrails for local and deployed setups."""

from backend.app.config import Settings


def test_default_cors_origins_cover_both_local_hosts_and_preview_ports():
    default = Settings.model_fields['cors_origins'].default
    for origin in (
        'http://localhost:5173', 'http://127.0.0.1:5173',
        'http://localhost:4173', 'http://127.0.0.1:4173',
    ):
        assert origin in default.split(',')
