"""LLM client setup for Google AI Studio (Gemini), OpenRouter, and DeepSeek.

Features a zero-crash, multi-model Gemini fallback cascade using Google AI Studio:
1. When GEMINI_API_KEY is provided, Gemini is preferred by default.
2. Ordered production & fallback cascade:
   - gemini-2.5-flash
   - gemini-2.5-flash-lite
   - gemini-2.0-flash
   - gemini-1.5-flash
   - gemini-1.5-flash-8b
3. Catches 404 (model not found / deprecated), 429 (rate limits / quota exhausted),
   and 503 (server overloaded). Logs a warning and immediately attempts generation
   with the next model in the fallback sequence.
4. Dynamic Discovery: If all hardcoded cascade models fail, queries client.models.list()
   for the first available active model supporting `generateContent` containing "flash".
5. Multi-Provider Fallback: If no Gemini key is set or all Gemini attempts fail,
   falls back to OpenRouter using OPENROUTER_API_KEY with openrouter/free (or configured model).
"""
import logging
import os

from openai import OpenAI

log = logging.getLogger("nutrisync.llm")

# Ordered cascade models for Google AI Studio
GEMINI_CASCADE_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
]

# provider -> (key env var, model env var, base_url, default model)
# Gemini is first so it is preferred when GEMINI_API_KEY is present
PROVIDERS = {
    "gemini": ("GEMINI_API_KEY", "GEMINI_MODEL", "https://generativelanguage.googleapis.com/v1beta/openai/", "auto"),
    "openrouter": ("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "https://openrouter.ai/api/v1", "openrouter/free"),
    "deepseek": ("DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "https://api.deepseek.com", "deepseek-chat"),
}
ALIASES = {"google": "gemini", "google-gemini": "gemini"}

_SKIP = (
    "image", "tts", "audio", "live", "embed", "vision", "robotics",
    "computer", "native", "dialog", "learnlm", "aqa", "imagen", "veo",
)


def _clean(name: str) -> str:
    """Env value with quotes/spaces stripped; blank and template placeholders count as empty."""
    value = (os.getenv(name) or "").strip().strip('"').strip("'").strip()
    if value.lower().startswith("your_") or value.lower() in {"none", "null", "changeme"}:
        return ""
    return value


def resolve_settings() -> dict:
    """Pick the provider whose key is filled in and return its settings.
    Default order prefers Gemini, then OpenRouter, then DeepSeek.
    """
    forced = _clean("LLM_PROVIDER").lower()
    forced = ALIASES.get(forced, forced)
    if forced and forced not in PROVIDERS:
        raise ValueError(f"Unknown LLM_PROVIDER '{forced}'. Use one of: {', '.join(PROVIDERS)}")

    order = [forced] if forced else ["gemini", "openrouter", "deepseek"]
    for name in order:
        key_var, model_var, base_url, default_model = PROVIDERS[name]
        key = _clean(key_var)
        if key:
            model = _clean("LLM_MODEL") or _clean(model_var) or default_model
            return {"provider": name, "api_key": key, "base_url": base_url, "model": model}
    return {"provider": forced, "api_key": "", "base_url": "", "model": ""}


_state = {"provider": "", "model": None, "candidates": None}


def build_client():
    """Returns (client_or_None, model, provider). model is "auto" for Gemini without an override."""
    s = resolve_settings()
    _state.update(provider=s["provider"], model=None, candidates=None)
    if not s["api_key"]:
        return None, s["model"], s["provider"]
    return OpenAI(base_url=s["base_url"], api_key=s["api_key"]), s["model"], s["provider"]


# ---------------------------------------------------------------------------
# Gemini Fallback & Dynamic Discovery
# ---------------------------------------------------------------------------
def _is_fallback_error(exc) -> bool:
    """True when the error is 404 (model not found / deprecated),
    429 (rate limits / quota exhausted), or 503 (server overloaded / unavailable).
    """
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "code", None)
    if status is None and hasattr(exc, "response"):
        status = getattr(exc.response, "status_code", None)

    if status in (404, 429, 503):
        return True

    code_str = str(status).upper() if status is not None else ""
    if code_str in ("RESOURCE_EXHAUSTED", "NOT_FOUND", "UNAVAILABLE"):
        return True

    text = str(exc).lower()
    fallback_terms = (
        # 404
        "404", "not found", "not_found", "no longer available",
        "does not exist", "is not supported", "model not found", "deprecated",
        # 429
        "429", "rate limit", "ratelimit", "resource_exhausted", "quota", "too many requests",
        # 503
        "503", "overloaded", "unavailable", "service unavailable", "backend error",
    )
    return any(term in text for term in fallback_terms)


def _discover_gemini_models(client) -> list:
    """Query client.models.list() to discover available active models containing 'flash'
    and supporting generateContent.
    """
    try:
        raw_list = client.models.list()
        items = list(raw_list)
    except Exception as exc:
        log.warning("Failed to query client.models.list() for dynamic discovery: %s", exc)
        return []

    discovered = []
    for item in items:
        raw_id = (
            getattr(item, "id", None)
            or getattr(item, "name", None)
            or (item.get("id") if isinstance(item, dict) else None)
            or (item.get("name") if isinstance(item, dict) else None)
            or str(item)
        )
        model_id = str(raw_id).split("/")[-1]
        name_lower = model_id.lower()

        # Must contain "flash"
        if "flash" not in name_lower:
            continue

        # Skip non-chat/unwanted models
        if any(skip in name_lower for skip in _SKIP):
            continue

        # Check supported_generation_methods if available
        methods = getattr(item, "supported_generation_methods", None)
        if methods is None and isinstance(item, dict):
            methods = item.get("supported_generation_methods")
        if methods is not None:
            methods_str = [str(m).lower() for m in methods]
            if not any("generatecontent" in m for m in methods_str):
                continue

        # Check state/status if available
        state = getattr(item, "state", None) or (item.get("state") if isinstance(item, dict) else None)
        if state and str(state).upper() in ("DEPRECATED", "DISABLED", "INACTIVE"):
            continue

        discovered.append(model_id)

    log.info("Dynamically discovered Gemini models: %s", discovered)
    return discovered


def _call(client, **kwargs):
    """chat.completions.create, retrying without `temperature` if a model rejects it."""
    try:
        return client.chat.completions.create(**kwargs)
    except Exception as exc:
        if "temperature" in kwargs and "temperature" in str(exc).lower():
            kwargs = {k: v for k, v in kwargs.items() if k != "temperature"}
            return client.chat.completions.create(**kwargs)
        raise


def create_completion(client, **kwargs):
    """Chat completion for the active provider with zero-crash fallback cascade.

    For Gemini:
    - Executes ordered cascade: gemini-2.5-flash -> gemini-2.5-flash-lite ->
      gemini-2.0-flash -> gemini-1.5-flash -> gemini-1.5-flash-8b.
    - Catches 404, 429, and 503 errors and attempts the next model.
    - If all hardcoded cascade models fail, dynamically queries client.models.list()
      for active models containing "flash" supporting generateContent.
    - If all Gemini models fail or key errors occur, falls back to OpenRouter
      if OPENROUTER_API_KEY is configured.
    """
    provider = _state.get("provider") or resolve_settings().get("provider")

    if client is None:
        openrouter_key = _clean("OPENROUTER_API_KEY")
        if openrouter_key:
            or_model = _clean("LLM_MODEL") or _clean("OPENROUTER_MODEL") or "openrouter/free"
            or_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
            return _call(or_client, model=or_model, **kwargs)
        raise RuntimeError("No AI client configured (set GEMINI_API_KEY or OPENROUTER_API_KEY)")

    if provider != "gemini":
        if kwargs.get("model") in ("auto", None, ""):
            kwargs["model"] = (
                _clean("LLM_MODEL")
                or _clean(PROVIDERS.get(provider, ("", "", "", ""))[1])
                or PROVIDERS.get(provider, ("", "", "", "openrouter/free"))[3]
            )
        return _call(client, **kwargs)

    requested = kwargs.pop("model", None)

    # Priority model: remembered working model or explicitly requested model
    priority_model = _state.get("model")
    if not priority_model and requested and requested != "auto":
        priority_model = requested

    # Build candidates starting with priority model, then GEMINI_CASCADE_MODELS
    candidates = []
    if priority_model:
        candidates.append(priority_model)
    for m in GEMINI_CASCADE_MODELS:
        if m not in candidates:
            candidates.append(m)

    tried = []
    last_exc = None

    # Step 1: Run through hardcoded cascade models
    for model in candidates:
        try:
            resp = _call(client, model=model, **kwargs)
            _state["model"] = model  # Remember working model
            return resp
        except Exception as exc:
            last_exc = exc
            if _is_fallback_error(exc):
                log.warning("Gemini model '%s' failed (%s); attempting next fallback model.", model, str(exc)[:150])
                tried.append(model)
                if _state.get("model") == model:
                    _state["model"] = None
                continue
            log.warning("Gemini model '%s' encountered error: %s", model, str(exc)[:150])
            tried.append(model)
            break

    # Step 2: Dynamic Discovery if hardcoded cascade models failed
    log.warning("All hardcoded Gemini cascade models failed (tried: %s). Running dynamic discovery.", tried)
    discovered = _discover_gemini_models(client)
    for model in discovered:
        if model in tried:
            continue
        try:
            resp = _call(client, model=model, **kwargs)
            _state["model"] = model
            return resp
        except Exception as exc:
            last_exc = exc
            if _is_fallback_error(exc):
                log.warning("Dynamically discovered Gemini model '%s' failed (%s); attempting next fallback model.", model, str(exc)[:150])
                tried.append(model)
                continue
            log.warning("Dynamically discovered Gemini model '%s' encountered error: %s", model, str(exc)[:150])
            tried.append(model)
            break

    # Step 3: Multi-Provider Fallback to OpenRouter
    openrouter_key = _clean("OPENROUTER_API_KEY")
    if openrouter_key:
        or_model = _clean("LLM_MODEL") or _clean("OPENROUTER_MODEL") or "openrouter/free"
        log.warning(
            "All Gemini attempts failed (tried: %s). Falling back to OpenRouter using model '%s'.",
            tried,
            or_model,
        )
        try:
            or_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
            return _call(or_client, model=or_model, **kwargs)
        except Exception as or_exc:
            log.error("OpenRouter fallback failed after Gemini failure: %s", or_exc)
            raise or_exc

    raise RuntimeError(
        f"All Gemini models failed (tried: {', '.join(tried)}) and no fallback provider is configured. "
        f"Last error: {last_exc}"
    )
