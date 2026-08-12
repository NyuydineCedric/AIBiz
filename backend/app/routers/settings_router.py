from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/profile", response_model=schemas.UserOut)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return schemas.UserOut.model_validate(current_user)


@router.put("/profile", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.email is not None:
        existing = (
            db.query(models.User)
            .filter(models.User.email == payload.email, models.User.id != current_user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use.")
        current_user.email = payload.email

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return schemas.UserOut.model_validate(current_user)


@router.get("/organization", response_model=schemas.OrganizationUpdate)
def get_organization(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return schemas.OrganizationUpdate(name=org.name, industry=org.industry)


@router.put("/organization", response_model=schemas.OrganizationUpdate)
def update_organization(
    payload: schemas.OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    if payload.name is not None:
        org.name = payload.name
    if payload.industry is not None:
        org.industry = payload.industry

    db.add(org)
    db.commit()
    db.refresh(org)
    return schemas.OrganizationUpdate(name=org.name, industry=org.industry)


@router.get("/notifications", response_model=schemas.NotificationPreferencesOut)
def get_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = (
        db.query(models.NotificationPreference)
        .filter(models.NotificationPreference.user_id == current_user.id)
        .first()
    )
    if not prefs:
        prefs = models.NotificationPreference(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return schemas.NotificationPreferencesOut.model_validate(prefs)


@router.put("/notifications", response_model=schemas.NotificationPreferencesOut)
def update_notifications(
    payload: schemas.NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = (
        db.query(models.NotificationPreference)
        .filter(models.NotificationPreference.user_id == current_user.id)
        .first()
    )
    if not prefs:
        prefs = models.NotificationPreference(user_id=current_user.id)

    if payload.risk_alerts is not None:
        prefs.risk_alerts = payload.risk_alerts
    if payload.weekly_report_emails is not None:
        prefs.weekly_report_emails = payload.weekly_report_emails
    if payload.forecast_updates is not None:
        prefs.forecast_updates = payload.forecast_updates

    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return schemas.NotificationPreferencesOut.model_validate(prefs)
