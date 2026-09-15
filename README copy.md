# NutriSync India — Multi-Agent Nutrition Coach

## Setup (Colab or local)

1. **Build the database first, once:**
   ```
   python db_setup.py
   ```
   This loads the 1,014-item Anuvaad food dataset from `data/anuvaad.xlsx`
   into `nutrisync.db` (SQLite) and creates all other tables.

2. **Add your OpenRouter API key** in `orchestrator.py`, line ~24:
   ```python
   api_key="sk-or-v1-PASTE-YOUR-KEY-HERE"
   ```
   (In Colab: use the Secrets panel and load it with `userdata.get()` instead,
   same pattern as the hospital agent project.)

3. **Run it:**
   ```
   python orchestrator.py
   ```

## File map (matches the 5-agent architecture)

| File | Role |
|---|---|
| `db_setup.py` | One-time: loads food data + creates all tables |
| `math_engine.py` | Deterministic Math Engine — NOT an LLM, all arithmetic |
| `rag_resolver.py` | RAG / Portion Resolver Agent — matches food names to real data |
| `memory_agent.py` | Memory Agent — user profile, daily logs, long-term patterns |
| `menu_planner.py` | Menu Planner Agent — suggests next meal from real data |
| `orchestrator.py` | Master Orchestrator — talks to the LLM and user, run this file |

Ingestion Agent and proactive scheduling are intentionally not yet built —
next phases, once this core loop is validated.

## Known data quality note

The source Anuvaad spreadsheet has a small number of rows with
implausible values (e.g. "Masala vada" shows fat content denser than
pure oil, likely a data-entry error upstream). `math_engine.py` flags
any food with >=50g fat per 100g with a `data_quality_warning` field,
and the Orchestrator is instructed to tell the user honestly rather
than present the number as fact. Worth mentioning as a real finding if
this comes up in review.
