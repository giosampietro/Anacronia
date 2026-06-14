from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath
import re

from anacronia.analysis_result_contract import RETENTION_CLASSES

LOCAL_PATH_PATTERNS = (
    re.compile(r"^file://", re.IGNORECASE),
    re.compile(r"^/[Uu]sers/"),
    re.compile(r"^/private/"),
    re.compile(r"^/tmp/"),
    re.compile(r"^/var/folders/"),
    re.compile(r"^[A-Za-z]:"),
)


class ArtifactStoreError(ValueError):
    pass


class ArtifactNotFoundError(FileNotFoundError):
    def __init__(self, namespace: str, key: str):
        super().__init__(f"Artifact not found: {namespace}/{key}")
        self.namespace = namespace
        self.key = key


@dataclass(frozen=True)
class ArtifactState:
    namespace: str
    key: str
    exists: bool
    byte_size: int | None = None
    retention_class: str | None = None
    content_type: str | None = None
    checksum_sha256: str | None = None

    def to_public_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "exists": self.exists,
            "key": self.key,
            "namespace": self.namespace,
        }
        if self.byte_size is not None:
            payload["byte_size"] = self.byte_size
        if self.checksum_sha256:
            payload["checksum_sha256"] = self.checksum_sha256
        if self.content_type:
            payload["content_type"] = self.content_type
        if self.retention_class:
            payload["retention_class"] = self.retention_class
        return payload


StoredArtifact = ArtifactState


@dataclass(frozen=True)
class ArtifactDeleteResult:
    namespace: str
    key: str
    existed: bool
    deleted: bool
    byte_size: int | None = None

    def to_public_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "deleted": self.deleted,
            "existed": self.existed,
            "key": self.key,
            "namespace": self.namespace,
        }
        if self.byte_size is not None:
            payload["byte_size"] = self.byte_size
        return payload


class LocalFilesystemArtifactStore:
    def __init__(self, data_root: Path):
        self.data_root = data_root.expanduser().resolve()
        self.metadata_root = self.data_root / ".artifact-store" / "metadata"

    def write_bytes(
        self,
        namespace: str,
        key: str,
        data: bytes,
        metadata: dict[str, object],
    ) -> StoredArtifact:
        normalized_namespace = validate_artifact_namespace(namespace)
        normalized_key = validate_artifact_key(key)
        normalized_metadata = _validate_metadata(metadata)
        artifact_path = self._artifact_path(normalized_namespace, normalized_key)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_bytes(data)
        self._write_metadata(
            normalized_namespace,
            normalized_key,
            normalized_metadata,
        )
        return self.stat(
            normalized_namespace,
            normalized_key,
            checksum=True,
        )

    def read_bytes(self, namespace: str, key: str) -> bytes:
        normalized_namespace = validate_artifact_namespace(namespace)
        normalized_key = validate_artifact_key(key)
        artifact_path = self._artifact_path(normalized_namespace, normalized_key)
        if not artifact_path.is_file():
            raise ArtifactNotFoundError(normalized_namespace, normalized_key)
        return artifact_path.read_bytes()

    def stat(
        self,
        namespace: str,
        key: str,
        *,
        metadata: dict[str, object] | None = None,
        checksum: bool = False,
    ) -> ArtifactState:
        normalized_namespace = validate_artifact_namespace(namespace)
        normalized_key = validate_artifact_key(key)
        artifact_path = self._artifact_path(normalized_namespace, normalized_key)
        stored_metadata = self._read_metadata(normalized_namespace, normalized_key)
        if metadata is not None:
            stored_metadata = _validate_metadata(metadata)
        if not artifact_path.is_file():
            return ArtifactState(
                namespace=normalized_namespace,
                key=normalized_key,
                exists=False,
                retention_class=stored_metadata.get("retention_class"),
                content_type=stored_metadata.get("content_type"),
            )

        data = artifact_path.read_bytes() if checksum else None
        return ArtifactState(
            namespace=normalized_namespace,
            key=normalized_key,
            exists=True,
            byte_size=artifact_path.stat().st_size,
            retention_class=stored_metadata.get("retention_class"),
            content_type=stored_metadata.get("content_type"),
            checksum_sha256=(
                hashlib.sha256(data).hexdigest() if data is not None else None
            ),
        )

    def list(self, namespace: str, prefix: str = "") -> list[ArtifactState]:
        normalized_namespace = validate_artifact_namespace(namespace)
        normalized_prefix = validate_artifact_prefix(prefix)
        namespace_path = self.data_root / normalized_namespace
        if not namespace_path.is_dir():
            return []

        states: list[ArtifactState] = []
        for artifact_path in sorted(namespace_path.rglob("*")):
            if not artifact_path.is_file():
                continue
            key = artifact_path.relative_to(namespace_path).as_posix()
            if normalized_prefix and not key.startswith(normalized_prefix):
                continue
            states.append(self.stat(normalized_namespace, key))
        return states

    def delete(self, namespace: str, key: str) -> ArtifactDeleteResult:
        normalized_namespace = validate_artifact_namespace(namespace)
        normalized_key = validate_artifact_key(key)
        artifact_path = self._artifact_path(normalized_namespace, normalized_key)
        metadata_path = self._metadata_path(normalized_namespace, normalized_key)
        if not artifact_path.is_file():
            if metadata_path.exists():
                metadata_path.unlink()
            return ArtifactDeleteResult(
                namespace=normalized_namespace,
                key=normalized_key,
                existed=False,
                deleted=False,
            )

        byte_size = artifact_path.stat().st_size
        artifact_path.unlink()
        if metadata_path.exists():
            metadata_path.unlink()
        return ArtifactDeleteResult(
            namespace=normalized_namespace,
            key=normalized_key,
            existed=True,
            deleted=True,
            byte_size=byte_size,
        )

    def _artifact_path(self, namespace: str, key: str) -> Path:
        return self.data_root / namespace / key

    def _metadata_path(self, namespace: str, key: str) -> Path:
        return self.metadata_root / namespace / f"{key}.metadata.json"

    def _write_metadata(
        self,
        namespace: str,
        key: str,
        metadata: dict[str, str],
    ) -> None:
        metadata_path = self._metadata_path(namespace, key)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def _read_metadata(self, namespace: str, key: str) -> dict[str, str]:
        metadata_path = self._metadata_path(namespace, key)
        if not metadata_path.is_file():
            return {"retention_class": "durable"}
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {"retention_class": "durable"}
        return _validate_metadata(payload)


def validate_artifact_namespace(namespace: str) -> str:
    return _validate_logical_path(namespace, label="Artifact namespace")


def validate_artifact_key(key: str) -> str:
    return _validate_logical_path(key, label="Artifact key")


def validate_artifact_prefix(prefix: str) -> str:
    normalized = str(prefix).strip()
    if not normalized:
        return ""
    if normalized.endswith("/"):
        validate_artifact_key(normalized[:-1])
        return normalized
    return validate_artifact_key(normalized)


def _validate_logical_path(value: str, *, label: str) -> str:
    normalized = str(value).strip()
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized == "."
        or "\\" in normalized
        or any(pattern.search(normalized) for pattern in LOCAL_PATH_PATTERNS)
        or normalized.startswith("/")
        or "." in path.parts
        or ".." in path.parts
        or path.as_posix() != normalized
    ):
        raise ArtifactStoreError(f"{label} must be a relative logical path.")
    return normalized


def _validate_metadata(metadata: dict[str, object]) -> dict[str, str]:
    retention_class = str(metadata.get("retention_class", "")).strip()
    if retention_class not in RETENTION_CLASSES:
        raise ArtifactStoreError("Artifact retention_class is not supported.")
    content_type = str(metadata.get("content_type", "")).strip()
    normalized = {"retention_class": retention_class}
    if content_type:
        normalized["content_type"] = content_type
    return normalized
