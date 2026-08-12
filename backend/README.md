# AI Biz backend

FastAPI backend for AI Biz: auth, file uploads (CSV/Excel/PDF), an insight
engine that derives KPIs/risks/recommendations from whatever you upload, a
chat endpoint (Gemini if configured, otherwise a rule-based fallback that
still answers from your real data), and PDF/Excel report generation.

## Quick start (local, no external services needed)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

The API is now running at `http://localhost:8000`. Interactive docs (Swagger
UI) are at `http://localhost:8000/docs`.

By default this uses:
- **SQLite** (`storage/ai_biz.db`) — no database setup required.
- **Rule-based AI fallback** — no Gemini key required. Answers and executive
  summaries are generated from the real numeric trends in whatever you
  upload, just without an LLM writing the prose.

## Connecting the frontend

The React app expects the backend at `http://localhost:8000` by default (see
`ai-biz-frontend/src/lib/api.ts`). If you run the backend on a different
host/port, set `VITE_API_BASE_URL` in a `.env` file inside `ai-biz-frontend/`.

CORS is controlled by `FRONTEND_ORIGIN` in `backend/.env` (defaults to
`http://localhost:5173`, Vite's default dev port).

## Switching to Supabase (Postgres)

1. Create a Supabase project and grab the connection string.
2. In `backend/.env`, set:
   ```
   DATABASE_URL=postgresql+psycopg2://postgres:<password>@<project>.supabase.co:5432/postgres
   ```
3. Add `psycopg2-binary` to `requirements.txt` and `pip install` it.
4. Restart the server — tables are created automatically on startup via
   `Base.metadata.create_all`. For production, swap this for Alembic
   migrations.

## Enabling Gemini

1. Get an API key from Google AI Studio.
2. In `backend/.env`, set `GEMINI_API_KEY=...`.
3. Restart the server. `/api/chat/ask` will now call `gemini-1.5-flash` with
   your dashboard context (KPIs, risks, recommendations) instead of using the
   rule-based fallback. If the call fails for any reason (bad key, no
   network), it silently falls back to the rule-based answer — the endpoint
   never breaks.

## How the "AI" works without a fixed schema

Since uploaded spreadsheets can have any column names, `insight_engine.py`
uses keyword matching (`revenue`/`sales`, `cost`/`expense`, `customer`/
`retention`/`churn`, `region`/`branch`) to guess which columns matter, then:

- **KPIs** — sum/mean/trend for the best-matching columns.
- **Risks** — flags a column as a risk if it moved more than a threshold
  (cost up >10%, revenue down >5%, etc).
- **Recommendations** — templated actions mapped to each risk type.
- **Forecast** (`forecast_engine.py`) — linear regression (numpy) projecting
  the next N periods, used by the Reports feature.

This means the dashboard is genuinely computed from whatever you upload, not
hardcoded — upload a real sales CSV and the KPIs/risks will reflect it.

## Project layout

```
app/
  main.py            FastAPI app, CORS, router registration
  config.py           env-based settings (DB, JWT, Gemini key, CORS origin)
  database.py, models.py   SQLAlchemy setup and tables
  security.py         bcrypt password hashing + JWT (PyJWT)
  schemas.py           Pydantic request/response models
  routers/             one file per feature area (auth, uploads, dashboard, chat, reports, settings)
  services/
    data_parser.py      CSV/Excel/PDF -> structured summary (pandas/pypdf)
    insight_engine.py   summary -> KPIs/risks/recommendations/series
    forecast_engine.py  numpy linear regression forecast
    ai_service.py        Gemini wrapper + rule-based fallback
    report_generator.py PDF (reportlab) + Excel (openpyxl) report generation
storage/
  uploads/<org_id>/    saved uploaded files
  reports/<org_id>/    generated PDF/Excel reports
```

## A note on verification

This backend was built and its business logic (file parsing, KPI/risk/recommendation
generation, forecasting, PDF/Excel report generation, password hashing, JWT)
was executed and tested directly against sample data. The FastAPI/SQLAlchemy
web layer itself could not be booted in the authoring sandbox (no package
registry access there), so it was verified by full syntax parsing and a
manual cross-check of every import/schema/model reference instead of a live
`uvicorn` run. Run `pip install -r requirements.txt` in your own environment
and it should come up cleanly — if anything errors, share the traceback and
it can be fixed immediately.
