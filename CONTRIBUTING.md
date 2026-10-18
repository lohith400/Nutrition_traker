# Contributing to NutriSync

Thank you for your interest in contributing to NutriSync! We welcome bug fixes, documentation improvements, and thoughtful feature contributions.

---

## Quick Workflow

1. **Fork and Clone**:
   - Fork this repository on GitHub.
   - Clone your fork locally:
     ```bash
     git clone https://github.com/<your-username>/Nutrition_traker.git
     cd Nutrition_traker
     ```

2. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```

3. **Set Up the Development Environment**:
   - **Backend**:
     ```bash
     python -m venv venv
     source venv/bin/activate       # On Windows: .\venv\Scripts\Activate.ps1
     pip install -r backend/requirements.txt -r requirements-dev.txt
     python backend/db_setup.py     # Builds local SQLite database if not already present
     ```
   - **Frontend**:
     ```bash
     cd frontend
     npm install
     ```

4. **Run Tests & Linters Before Committing**:
   - Lint Python code with Ruff:
     ```bash
     ruff check .
     ```
   - Run smoke tests with Pytest:
     ```bash
     pytest -v tests/test_smoke.py
     ```
   - Check frontend code:
     ```bash
     cd frontend
     npm run lint
     npm run build
     ```

5. **Commit & Open a Pull Request**:
   - Write clear, conventional commit messages (e.g. `fix: ...`, `feat: ...`, `docs: ...`).
   - Push to your fork:
     ```bash
     git push origin feat/your-feature-name
     ```
   - Open a Pull Request into `main`. Fill in the PR description template.

---

## Code Guidelines
- **Deterministic Math Engine**: Nutritional calculations, BMR, RDAs, and macro math must remain pure, deterministic Python functions. LLMs should never be tasked with performing raw calorie arithmetic.
- **Data Quality**: Changes to food item matching or parsing must respect the validation gates in `backend/food_quality.py`.
- **Security**: Never commit secrets, credentials, or `.env` files.
