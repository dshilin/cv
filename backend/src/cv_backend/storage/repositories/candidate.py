from datetime import datetime, timezone
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from cv_backend.domain.candidate import CandidateItemInput
from cv_backend.storage.models.candidate import (
    CandidateBaseModel,
    CandidateItemModel,
    CandidateItemVersionModel,
)

_ITEM_ADAPTER = TypeAdapter(CandidateItemInput)


class CandidateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add_items(self, owner_id: UUID, items: list[CandidateItemInput]) -> list[CandidateItemModel]:
        base = self.session.scalar(
            select(CandidateBaseModel).where(CandidateBaseModel.owner_id == owner_id)
        )
        if base is None:
            base = CandidateBaseModel(owner_id=owner_id)
            self.session.add(base)
            self.session.flush()
        result = []
        for item in items:
            data = item.model_dump(mode="json")
            kind = data.pop("kind")
            row = CandidateItemModel(
                base_id=base.id,
                owner_id=owner_id,
                item_type=kind,
                payload=data,
                status="confirmed",
                version=1,
            )
            self.session.add(row)
            self.session.flush()
            self.session.add(
                CandidateItemVersionModel(
                    item_id=row.id,
                    owner_id=owner_id,
                    version_number=1,
                    item_type=kind,
                    payload=data,
                    status="confirmed",
                )
            )
            result.append(row)
        return result

    def add_contact_if_missing(self, owner_id: UUID, contact: CandidateItemInput) -> tuple[CandidateItemModel, bool]:
        data = contact.model_dump(mode="json")
        if data.get("kind") != "contact":
            raise ValueError("Contact input required")
        label = str(data["label"]).strip().casefold()
        value = str(data["value"]).strip().casefold()
        existing = self.session.scalars(
            select(CandidateItemModel).where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.item_type == "contact",
                CandidateItemModel.is_deleted.is_(False),
            )
        ).all()
        for item in existing:
            if (str(item.payload.get("label", "")).strip().casefold() == label
                    and str(item.payload.get("value", "")).strip().casefold() == value):
                return item, False
        return self.add_items(owner_id, [contact])[0], True

    def get_item(self, owner_id: UUID, item_id: UUID) -> CandidateItemModel | None:
        return self.session.scalar(
            select(CandidateItemModel)
            .where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.id == item_id,
                CandidateItemModel.is_deleted.is_(False),
            )
            .options(selectinload(CandidateItemModel.versions))
        )

    def list_items(self, owner_id: UUID) -> list[CandidateItemModel]:
        return list(
            self.session.scalars(
                select(CandidateItemModel).where(
                    CandidateItemModel.owner_id == owner_id,
                    CandidateItemModel.is_deleted.is_(False),
                )
            ).all()
        )

    def soft_delete_item(self, owner_id: UUID, item_id: UUID) -> bool:
        item = self.session.scalar(
            select(CandidateItemModel).where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.id == item_id,
            )
        )
        if item is None:
            return False
        if not item.is_deleted:
            item.is_deleted = True
            item.deleted_at = datetime.now(timezone.utc)
        self.session.flush()
        return True

    def update_item(
        self, owner_id: UUID, item_id: UUID, changes: dict[str, object]
    ) -> CandidateItemModel | None:
        item = self.get_item(owner_id, item_id)
        if item is None:
            return None
        candidate = {"kind": item.item_type, **item.payload, **changes}
        validated = _ITEM_ADAPTER.validate_python(candidate)
        data = validated.model_dump(mode="json")
        kind = data.pop("kind")
        new_version = item.version + 1
        item.item_type = kind
        item.payload = data
        item.version = new_version
        self.session.add(
            CandidateItemVersionModel(
                item_id=item.id,
                owner_id=owner_id,
                version_number=new_version,
                item_type=kind,
                payload=data,
                status=item.status,
            )
        )
        self.session.flush()
        return item
