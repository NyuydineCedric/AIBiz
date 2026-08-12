from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user
from ..services import ai_service
from .dashboard import _latest_parsed_dataset

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _build_context(db: Session, org_id: str) -> dict:
    dataset = _latest_parsed_dataset(db, org_id)
    if not dataset:
        return {"kpis": [], "risks": [], "recommendations": [], "executive_summary": "", "region_breakdown": {}}

    insights = db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).all()
    risks = [{"severity": i.severity, "text": i.text} for i in insights if i.type == "risk"]
    recommendations = [i.text for i in insights if i.type == "recommendation"]

    return {
        "kpis": dataset.kpis or [],
        "risks": risks,
        "recommendations": recommendations,
        "executive_summary": dataset.executive_summary or "",
        "region_breakdown": dataset.region_series or {},
    }


@router.post("/ask", response_model=schemas.ChatResponse)
def ask_question(
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    context = _build_context(db, current_user.organization_id)
    answer = ai_service.answer_question(payload.question, context)

    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            role="user",
            text=payload.question,
        )
    )
    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            role="ai",
            text=answer,
        )
    )
    db.commit()

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.organization_id == current_user.organization_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    return schemas.ChatResponse(
        answer=answer,
        history=[schemas.ChatMessageOut.model_validate(m) for m in history],
    )


@router.get("/history", response_model=list[schemas.ChatMessageOut])
def chat_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.organization_id == current_user.organization_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    return [schemas.ChatMessageOut.model_validate(m) for m in history]
