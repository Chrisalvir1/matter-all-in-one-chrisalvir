"""Confirm that Matter All-in-One's HA websocket commands still exist in Core."""

from pathlib import Path

import homeassistant.core
from homeassistant import const
from homeassistant.components.websocket_api import commands


REPO_ROOT = Path(__file__).parents[1]
CLIENT_SOURCE = REPO_ROOT / "matter-all-in-one-addon" / "src" / "homeAssistant.ts"


def test_exact_core_target():
    assert (const.MAJOR_VERSION, const.MINOR_VERSION, str(const.PATCH_VERSION)) == (2026, 10, "0")


def test_client_commands_are_registered_by_core():
    handlers = (
        commands.handle_get_states,
        commands.handle_get_config,
        commands.handle_call_service,
        commands.handle_subscribe_events,
        commands.handle_unsubscribe_events,
    )
    registered = {handler._ws_command for handler in handlers}
    source = CLIENT_SOURCE.read_text(encoding="utf-8")
    for command in ("get_states", "get_config", "call_service", "subscribe_events", "unsubscribe_events"):
        assert command in registered
        assert f'"{command}"' in source
