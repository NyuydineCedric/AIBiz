from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user
from ..services import ai_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _build_context(dataset: models.Dataset | None, db: Session, org_id: str) -> dict:
    if not dataset or dataset.status != "parsed":
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


def _get_session_or_404(db: Session, session_id: str, org_id: str) -> models.ChatSession:
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.organization_id == org_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


@router.get("/sessions", response_model=list[schemas.ChatSessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sessions = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.organization_id == current_user.organization_id)
        .order_by(models.ChatSession.created_at.desc())
        .all()
    )
    out = []
    for s in sessions:
        out.append(
            schemas.ChatSessionOut(
                id=s.id,
                title=s.title,
                dataset_id=s.dataset_id,
                dataset_filename=s.dataset.filename if s.dataset else None,
                dataset_status=s.dataset.status if s.dataset else None,
                created_at=s.created_at,
            )
        )
    return out


@router.get("/sessions/{session_id}/messages", response_model=list[schemas.ChatMessageOut])
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    return [schemas.ChatMessageOut.model_validate(m) for m in session.messages]


@router.post("/sessions/{session_id}/ask", response_model=schemas.ChatResponse)
def ask_question_in_session(
    session_id: str,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    context = _build_context(session.dataset, db, current_user.organization_id)
    answer = ai_service.answer_question(payload.question, context)

    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            session_id=session.id,
            user_id=current_user.id,
            role="user",
            text=payload.question,
        )
    )
    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            session_id=session.id,
            user_id=current_user.id,
            role="ai",
            text=answer,
        )
    )
    db.commit()

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session.id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    return schemas.ChatResponse(
        answer=answer,
        history=[schemas.ChatMessageOut.model_validate(m) for m in history],
    )


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session.id).delete()
    db.delete(session)
    db.commit()