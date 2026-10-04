"""LLM client setup for exactly three providers: OpenRouter, Gemini, DeepSeek.

Fill in ONE of these keys in backend/.env and leave the other two blank:

    OPENROUTER_API_KEY=...
    GEMINI_API_KEY=...
    DEEPSEEK_API_KEY=...

Whichever key is filled is the one used. If you fill more than one, the first
in this order wins: OpenRouter, Gemini, DeepSeek -- or force one with
LLM_PROVIDER=openrouter|gemini|deepseek.

Optional model override per provider (defaults are used when blank):
    OPENROUTER_MODEL, GEMINI_MODEL, DEEPSEEK_MODEL   (or LLM_MODEL for whichever is active)

Gemini needs no model name: when GEMINI_MODEL is blank the backend asks Google
which models your key can use and picks the newest Gemini Flash automatically.
If a model is ever retired (404 "no longer available"), it silently switches to
the next available one instead of failing.
"""
import logging
import os
import re

from openai import OpenAI

log = logging.getLogger("nutrisync.llm")

# provider -> (key env var, model env var, base_url, default model)
PROVIDERS = {
    "openrouter": ("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini"),
    "gemini": ("GEMINI_API_KEY", "GEMINI_MODEL", "https://generativelanguage.googleapis.com/v1beta/openai/", "auto"),
    "deepseek": ("DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "https://api.deepseek.com", "deepseek-chat"),
}
ALIASES = {"google": "gemini", "google-gemini": "gemini"}


def _clean(name: str) -> str:
    """Env value with quotes/spaces stripped; blank and template placeholders count as empty."""
    value = (os.getenv(name) or "").strip().strip('"').strip("'").strip()
    if value.lower().startswith("your_") or value.lower() in {"none", "null", "changeme"}:
        return ""
    return value


def resolve_settings() -> dict:
    """Pick the provider whose key is filled in and return its settings."""
    forced = _clean("LLM_PROVIDER").lower()
    forced = ALIASES.get(forced, forced)
    if forced and forced not in PROVIDERS:
        raise ValueError(f"Unknown LLM_PROVIDER '{forced}'. Use one of: {', '.join(PROVIDERS)}")

    order = [forced] if forced else list(PROVIDERS)
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
# Gemini: discover available models instead of hard-coding one
# ---------------------------------------------------------------------------
_SKIP = ("image", "tts", "audio", "live", "embed", "vision", "robotics", "computer", "native", "dialog",
         "learnlm", "aqa", "imagen", "veo")


def _rank_gemini(model_id: str):
    """Sort key for usable text/chat Gemini models: newest Flash first, then Pro, then Lite."""
    name = model_id.split("/")[-1].lower()
    if not name.startswith("gemini-") or any(word in name for word in _SKIP):
        return None
    m = re.match(r"gemini-(\d+(?:\.\d+)?)-(flash|pro)(.*)$", name)
    if m:
        version, family, rest = float(m.group(1)), m.group(2), m.group(3)
        return (0 if family == "flash" else 1, -version, 1 if "lite" in rest else 0,
                1 if ("preview" in rest or "exp" in rest) else 0, name)
    if name in ("gemini-flash-latest", "gemini-pro-latest"):  # aliases Google keeps pointing at the newest model
        return (2, 0, 0, 0, name)
    return None


def _gemini_candidates(client, refresh=False):
    if _state["candidates"] is None or refresh:
        ids = [m.id for m in client.models.list()]
        ranked = sorted((r, i.split("/")[-1]) for i in ids if (r := _rank_gemini(i)) is not None)
        _state["candidates"] = [name for _, name in ranked]
        log.info("Gemini models available to this key (best first): %s", _state["candidates"][:8])
    return _state["candidates"]


def _is_model_error(exc) -> bool:
    """True when the failure is about the model itself (retired / unknown / unsupported), not auth or quota."""
    text = str(exc).lower()
    if getattr(exc, "status_code", None) == 404:
        return True
    return any(p in text for p in ("no longer available", "is not found", "not_found", "is not supported",
                                   "model not found", "does not exist"))


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
    """Chat completion for the active provider.

    OpenRouter / DeepSeek: plain call with the configured model.
    Gemini: model is auto-detected when not overridden, and if the model is retired or
    unavailable the next available Gemini model is used instead of returning an error.
    """
    if _state["provider"] != "gemini":
        return _call(client, **kwargs)

    requested = kwargs.pop("model", None)
    model = _state["model"] or (requested if requested and requested != "auto" else None)
    tried = []
    for _ in range(6):
        if model is None:
            candidates = [c for c in _gemini_candidates(client) if c not in tried]
            if not candidates:
                raise RuntimeError("No usable Gemini model is available for this API key.")
            model = candidates[0]
        try:
            response = _call(client, model=model, **kwargs)
            _state["model"] = model  # remember the model that works
            return response
        except Exception as exc:
            if not _is_model_error(exc):
                raise
            log.warning("Gemini model '%s' unavailable (%s); trying another.", model, str(exc)[:120])
            tried.append(model)
            _state["model"] = None
            model = None
            try:
                _gemini_candidates(client, refresh=True)
            except Exception:
                raise exc
    raise RuntimeError(f"No working Gemini model found (tried: {', '.join(tried)}).")
