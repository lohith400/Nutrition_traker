"""Master Orchestrator Agent."""
import json
import os
from datetime import datetime
from openai import OpenAI

import math_engine
import rag_resolver
import memory_agent
import menu_planner

api_key = os.getenv("OPENROUTER_API_KEY")
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key) if api_key else None
MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")

# The tool functions and tool schemas are defined below and remain shared by the CLI and API.
