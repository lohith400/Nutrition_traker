"""Unit tests for Agentic Orchestrator Logic (backend/orchestrator.py).

Tests prompt formation, response parsing, tool execution, and claims-checking.
All external LLM calls (Gemini, OpenRouter, DeepSeek) are mocked offline using unittest.mock.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend import orchestrator


# ---------------------------------------------------------------------------
# Prompt Formation & Message Preparation
# ---------------------------------------------------------------------------

def test_prepare_messages_system_prompt_and_history():
    context = {
        "profile": {"name": "Test User", "target_calories": 2000},
        "budget": {"remaining_calories": 1400},
        "meals": [],
    }
    history = [
        {"role": "user", "content": "Hello coach"},
        {"role": "assistant", "content": "Hi there! How can I help you today?"},
    ]

    messages = orchestrator._prepare_messages("I had breakfast", history=history, context=context)

    # 1 system + 2 history + 1 user = 4 messages
    assert len(messages) == 4
    assert messages[0]["role"] == "system"
    assert "NutriSync India" in messages[0]["content"]
    assert "2000" in messages[0]["content"]
    assert messages[1]["content"] == "Hello coach"
    assert messages[3]["content"] == "I had breakfast"


def test_prepare_messages_flags_unverified_logged_claims():
    """If a prior assistant turn claimed to log food but tool_events shows it didn't,
    a system note must be appended to the transcript to prevent hallucination propagation."""
    history = [
        {
            "role": "assistant",
            "content": "I have successfully logged 2 idlis for your breakfast.",
            "tool_events": [],  # No successful log_food tool call!
        }
    ]

    messages = orchestrator._prepare_messages("what did I eat?", history=history)
    assistant_msg = messages[1]
    assert "[System note: nothing was actually saved to the food log in this message.]" in assistant_msg["content"]


def test_prepare_messages_with_image():
    messages = orchestrator._prepare_messages("What is this dish?", image="data:image/jpeg;base64,mockbase64data")
    user_turn = messages[-1]
    assert isinstance(user_turn["content"], list)
    assert any(part.get("type") == "image_url" for part in user_turn["content"])


# ---------------------------------------------------------------------------
# Regex Checks: _claims_logged & _log_succeeded
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text, expected_claim",
    [
        ("I've just logged 2 rotis to your lunch.", True),
        ("I have logged this in your food log.", True),
        ("Successfully logged 1 plate of poha.", True),
        ("It has been saved to your log.", True),
        ("2 idlis have about 69 calories and 2.4g protein.", False),
        ("Would you like me to log this for breakfast?", False),
    ],
)
def test_claims_logged_regex(text, expected_claim):
    assert orchestrator._claims_logged(text) == expected_claim


def test_log_succeeded():
    # Successful food log
    events_ok = [{"tool": "log_food", "result": {"status": "logged"}}]
    assert orchestrator._log_succeeded(events_ok) is True

    # Successful water log
    water_ok = [{"tool": "log_water", "result": {"status": "logged"}}]
    assert orchestrator._log_succeeded(water_ok) is True

    # Unsuccessful food log or lookup only
    lookup_only = [{"tool": "lookup_food", "result": {"status": "found"}}]
    assert orchestrator._log_succeeded(lookup_only) is False

    failed_log = [{"tool": "log_food", "result": {"status": "error"}}]
    assert orchestrator._log_succeeded(failed_log) is False


# ---------------------------------------------------------------------------
# Tool: lookup_food Special Handling (Water & Options)
# ---------------------------------------------------------------------------

def test_water_result_interception():
    res1 = orchestrator._water_result("water")
    assert res1 is not None
    assert res1["status"] == "not_a_food"

    res2 = orchestrator._water_result("2 glasses of water")
    assert res2 is not None
    assert res2["status"] == "not_a_food"

    assert orchestrator._water_result("water chestnut") is None
    assert orchestrator._water_result("idli") is None


def test_tool_lookup_food_options_water():
    res = orchestrator._tool_lookup_food_options("glass of water")
    assert res["status"] == "not_a_food"
    assert "log_water" in res["message"]


# ---------------------------------------------------------------------------
# Mocked chat_with_tools LLM Flow
# ---------------------------------------------------------------------------

@patch.object(orchestrator, "client", MagicMock())
@patch("backend.llm_config.create_completion")
def test_chat_with_tools_text_reply(mock_create_completion):
    """Test plain conversational reply without tool calls."""
    mock_resp = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    tool_calls=[],
                    content="Hello! You have 1,200 calories remaining today.",
                )
            )
        ]
    )
    mock_create_completion.return_value = mock_resp

    res = orchestrator.chat_with_tools("How many calories do I have left?")
    assert res["reply"] == "Hello! You have 1,200 calories remaining today."
    assert res["tool_events"] == []


@patch.object(orchestrator, "client", MagicMock())
@patch("backend.llm_config.create_completion")
def test_chat_with_tools_tool_execution(mock_create_completion, mock_db):
    """Test multi-turn tool call execution (ToolCall -> Tool Execution -> Final Reply)."""
    # Turn 1: LLM returns tool_call to lookup_food
    tool_call = SimpleNamespace(
        id="call_123",
        function=SimpleNamespace(
            name="lookup_food",
            arguments='{"item_name": "idli", "quantity": 2, "unit": "serving"}',
        ),
    )
    turn1_msg = SimpleNamespace(
        tool_calls=[tool_call],
        content=None,
    )

    # Turn 2: LLM returns final response text after tool output
    turn2_msg = SimpleNamespace(
        tool_calls=[],
        content="2 idlis have 69 kcal. Would you like me to log them for breakfast?",
    )

    mock_create_completion.side_effect = [
        SimpleNamespace(choices=[SimpleNamespace(message=turn1_msg)]),
        SimpleNamespace(choices=[SimpleNamespace(message=turn2_msg)]),
    ]

    res = orchestrator.chat_with_tools("I had 2 idlis")
    assert "69 kcal" in res["reply"]
    assert len(res["tool_events"]) == 1
    assert res["tool_events"][0]["tool"] == "lookup_food"


@patch.object(orchestrator, "client", None)
def test_chat_with_tools_raises_when_no_client():
    """Must raise RuntimeError cleanly if no AI provider is configured."""
    with pytest.raises(RuntimeError, match="No AI key configured"):
        orchestrator.chat_with_tools("hello")
