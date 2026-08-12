from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from . import models  # noqa: F401 - ensures models are registered on Base before create_all
from .routers import auth, uploads, dashboard, chat, reports, settings_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Biz API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(uploads.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(reports.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
