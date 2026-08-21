from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[schemas.ProductOut])
def list_products(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Product)
        .filter(models.Product.organization_id == current_user.organization_id)
        .order_by(models.Product.name.asc())
        .all()
    )
    return [schemas.ProductOut.model_validate(r) for r in rows]


@router.post("", response_model=schemas.ProductOut, status_code=201)
def create_product(
    payload: schemas.ProductIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the product a name.")

    # Same product shouldn't get added twice (case-insensitive) — that's
    # exactly the "Rice" vs "rice" split-metric problem the catalog exists
    # to prevent in the first place.
    existing = (
        db.query(models.Product)
        .filter(
            models.Product.organization_id == current_user.organization_id,
            models.Product.name.ilike(name),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f'"{name}" is already in your product list.')

    row = models.Product(
        organization_id=current_user.organization_id,
        name=name,
        category=payload.category.strip(),
        default_unit_price=payload.default_unit_price,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.ProductOut.model_validate(row)


@router.put("/{product_id}", response_model=schemas.ProductOut)
def update_product(
    product_id: str,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Prices drift up and down over time — this lets the owner update a
    product's default price (or fix its name/category) without deleting
    and re-adding it, which would also orphan it from its sales history."""
    row = (
        db.query(models.Product)
        .filter(models.Product.id == product_id, models.Product.organization_id == current_user.organization_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Product not found.")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Give the product a name.")
        dup = (
            db.query(models.Product)
            .filter(
                models.Product.organization_id == current_user.organization_id,
                models.Product.name.ilike(name),
                models.Product.id != product_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail=f'"{name}" is already in your product list.')
        row.name = name

    if payload.category is not None:
        row.category = payload.category.strip()

    if payload.default_unit_price is not None:
        if payload.default_unit_price < 0:
            raise HTTPException(status_code=400, detail="Price can't be negative.")
        row.default_unit_price = payload.default_unit_price

    db.commit()
    db.refresh(row)
    return schemas.ProductOut.model_validate(row)


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = (
        db.query(models.Product)
        .filter(models.Product.id == product_id, models.Product.organization_id == current_user.organization_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Product not found.")
    db.delete(row)
    db.commit()
    return None
