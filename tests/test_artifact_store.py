import hashlib
import json

import pytest

from anacronia.analysis_result_contract import analysis_result_explorer_readiness
from anacronia.artifact_store import (
    ArtifactDeleteResult,
    ArtifactNotFoundError,
    ArtifactStoreError,
    LocalFilesystemArtifactStore,
    validate_artifact_key,
    validate_artifact_namespace,
)


def test_store_writes_reads_and_stats_artifact_by_namespace_and_key(tmp_path):
    store = LocalFilesystemArtifactStore(tmp_path)

    stored = store.write_bytes(
        "analysis-results/analysis-result-a",
        "viewer/map-data.json",
        b"{}",
        metadata={
            "content_type": "application/json",
            "retention_class": "durable",
        },
    )

    state = store.stat(
        "analysis-results/analysis-result-a",
        "viewer/map-data.json",
        checksum=True,
    )

    assert store.read_bytes(
        "analysis-results/analysis-result-a",
        "viewer/map-data.json",
    ) == b"{}"
    assert stored == state
    assert state.namespace == "analysis-results/analysis-result-a"
    assert state.key == "viewer/map-data.json"
    assert state.exists is True
    assert state.byte_size == 2
    assert state.content_type == "application/json"
    assert state.retention_class == "durable"
    assert state.checksum_sha256 == hashlib.sha256(b"{}").hexdigest()
    assert state.to_public_dict() == {
        "byte_size": 2,
        "checksum_sha256": hashlib.sha256(b"{}").hexdigest(),
        "content_type": "application/json",
        "exists": True,
        "key": "viewer/map-data.json",
        "namespace": "analysis-results/analysis-result-a",
        "retention_class": "durable",
    }
    assert str(tmp_path) not in json.dumps(state.to_public_dict())


def test_store_isolates_namespaces_and_lists_artifacts_by_prefix(tmp_path):
    store = LocalFilesystemArtifactStore(tmp_path)
    metadata = {
        "content_type": "application/json",
        "retention_class": "durable",
    }

    store.write_bytes(
        "analysis-results/result-a",
        "viewer/map-data.json",
        b"a",
        metadata=metadata,
    )
    store.write_bytes(
        "analysis-results/result-b",
        "viewer/map-data.json",
        b"b",
        metadata=metadata,
    )
    store.write_bytes(
        "analysis-results/result-a",
        "manifest.jsonl",
        b"{}",
        metadata={
            "content_type": "application/x-jsonlines",
            "retention_class": "durable",
        },
    )

    states = store.list("analysis-results/result-a", prefix="viewer/")

    assert store.read_bytes("analysis-results/result-a", "viewer/map-data.json") == b"a"
    assert store.read_bytes("analysis-results/result-b", "viewer/map-data.json") == b"b"
    assert [state.key for state in states] == ["viewer/map-data.json"]
    assert states[0].namespace == "analysis-results/result-a"
    assert states[0].byte_size == 1


def test_store_reports_missing_artifacts_and_deletes_by_logical_key(tmp_path):
    store = LocalFilesystemArtifactStore(tmp_path)

    missing = store.stat(
        "analysis-results/result-a",
        "missing.json",
        metadata={
            "content_type": "application/json",
            "retention_class": "viewer-cache",
        },
    )

    assert missing.exists is False
    assert missing.to_public_dict() == {
        "content_type": "application/json",
        "exists": False,
        "key": "missing.json",
        "namespace": "analysis-results/result-a",
        "retention_class": "viewer-cache",
    }
    with pytest.raises(ArtifactNotFoundError) as error:
        store.read_bytes("analysis-results/result-a", "missing.json")
    assert error.value.namespace == "analysis-results/result-a"
    assert error.value.key == "missing.json"
    assert store.delete(
        "analysis-results/result-a",
        "missing.json",
    ) == ArtifactDeleteResult(
        namespace="analysis-results/result-a",
        key="missing.json",
        existed=False,
        deleted=False,
        byte_size=None,
    )

    store.write_bytes(
        "analysis-results/result-a",
        "viewer/map-data.json",
        b"data",
        metadata={
            "content_type": "application/json",
            "retention_class": "viewer-cache",
        },
    )

    assert store.delete(
        "analysis-results/result-a",
        "viewer/map-data.json",
    ) == ArtifactDeleteResult(
        namespace="analysis-results/result-a",
        key="viewer/map-data.json",
        existed=True,
        deleted=True,
        byte_size=4,
    )
    assert store.stat("analysis-results/result-a", "viewer/map-data.json").exists is False


@pytest.mark.parametrize(
    "unsafe_value",
    [
        "",
        ".",
        "../manifest.jsonl",
        "a/../manifest.jsonl",
        "a/./manifest.jsonl",
        "a//manifest.jsonl",
        "/tmp/manifest.jsonl",
        "/private/tmp/manifest.jsonl",
        "/Users/giorgio/manifest.jsonl",
        "/var/folders/manifest.jsonl",
        "file:///tmp/manifest.jsonl",
        "C:/tmp/manifest.jsonl",
        "C:tmp/manifest.jsonl",
        r"C:\tmp\manifest.jsonl",
        r"viewer\map-data.json",
    ],
)
def test_store_rejects_unsafe_keys_and_namespaces(unsafe_value):
    with pytest.raises(ArtifactStoreError):
        validate_artifact_key(unsafe_value)
    with pytest.raises(ArtifactStoreError):
        validate_artifact_namespace(unsafe_value)


def test_store_rejects_unsupported_retention_classes_before_writing(tmp_path):
    store = LocalFilesystemArtifactStore(tmp_path)

    with pytest.raises(ArtifactStoreError):
        store.write_bytes(
            "analysis-results/result-a",
            "viewer/map-data.json",
            b"{}",
            metadata={
                "content_type": "application/json",
                "retention_class": "temporary",
            },
        )

    assert list(tmp_path.rglob("*")) == []


def test_store_reads_existing_analysis_result_artifacts_and_feeds_readiness(tmp_path):
    namespace = "analysis-results/analysis-result-a"
    (tmp_path / namespace / "manifest.jsonl").parent.mkdir(parents=True)
    (tmp_path / namespace / "manifest.jsonl").write_text("{}", encoding="utf-8")
    atlas_path = tmp_path / namespace / "viewer" / "atlases" / "32px"
    atlas_path.mkdir(parents=True)
    (atlas_path / "atlas-manifest.json").write_text("{}", encoding="utf-8")
    store = LocalFilesystemArtifactStore(tmp_path)
    artifacts = [
        {
            "key": "manifest.jsonl",
            "required": True,
            "retention_class": "durable",
        },
        {
            "key": "layouts/dinov3_vits_384_umap.json",
            "required": True,
            "retention_class": "durable",
        },
        {
            "key": "viewer/atlases/32px/atlas-manifest.json",
            "required": False,
            "retention_class": "render-cache",
        },
    ]

    manifest_state = store.stat(
        namespace,
        "manifest.jsonl",
        metadata={
            "content_type": "application/x-jsonlines",
            "retention_class": "durable",
        },
    )
    existing_keys = {state.key for state in store.list(namespace)}

    assert store.read_bytes(namespace, "manifest.jsonl") == b"{}"
    assert manifest_state.exists is True
    assert manifest_state.byte_size == 2
    assert existing_keys == {
        "manifest.jsonl",
        "viewer/atlases/32px/atlas-manifest.json",
    }
    assert analysis_result_explorer_readiness(
        artifacts=artifacts,
        existing_artifact_keys=existing_keys,
    ) == {
        "missing_optional_artifact_keys": [],
        "missing_required_artifact_keys": ["layouts/dinov3_vits_384_umap.json"],
        "ready": False,
    }
    assert str(tmp_path) not in json.dumps(
        [state.to_public_dict() for state in store.list(namespace)]
    )
