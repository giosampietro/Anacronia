from typing import TypeAlias


SourceObjectId: TypeAlias = str
ProviderObjectIdValue: TypeAlias = SourceObjectId | int


def normalize_source_object_id(value: object) -> SourceObjectId:
    return str(value).strip()


def provider_object_id_value(*, provider: str, value: object) -> ProviderObjectIdValue:
    source_object_id = normalize_source_object_id(value)
    if provider == "met" and source_object_id.isdecimal():
        return int(source_object_id)
    return source_object_id
