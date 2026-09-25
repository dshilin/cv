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

    def get_item(self, owner_id: UUID, item_id: UUID) -> CandidateItemModel | None:
        return self.session.scalar(
            select(CandidateItemModel)
            .where(CandidateItemModel.owner_id == owner_id, CandidateItemModel.id == item_id)
            .options(selectinload(CandidateItemModel.versions))
        )

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
