import json

import pytest

from anacronia import analysis_result_registry
from anacronia.artifact_store import ArtifactStoreError
from anacronia.analysis_result_registry import LocalAnalysisResultRegistry


def valid_manifest():
    return {
        "analysis_kind": "latent-map",
        "analysis_job_id": "analysis-job-20260614T130000Z",
        "analysis_result_id": "analysis-result-20260614T130000Z-dinov3_vits_384",
        "asset_kind": "analysis-result-manifest",
        "created_at": "2026-06-14T13:00:00Z",
        "explorer_readiness": {
            "missing_optional_artifact_keys": [],
            "missing_required_artifact_keys": [],
            "ready": True,
        },
        "export_safety": {
            "contains_local_absolute_paths": False,
            "contains_secrets": False,
            "contains_temporary_paths": False,
        },
        "item_count": 2,
        "output_counts": {
            "artifacts": {"durable": 3, "render-cache": 1, "total": 4}
        },
        "recipes": [
            {
                "recipe_name": "dinov3_vits_384",
                "recipe": {"model_id": "facebook/dinov3-vits16-pretrain-lvd1689m"},
            }
        ],
        "schema_version": 1,
        "scope_snapshot": {
            "item_count": 2,
            "snapshot_id": "analysis-scope-20260614T130000Z",
            "snapshot_key": "analysis-scopes/analysis-scope-20260614T130000Z.json",
        },
        "sibling_group_id": "analysis-sibling-20260614T130000Z",
        "source": {
            "kind": "analysis-scope-snapshot",
            "source_folder_name": "Bread",
        },
        "status": "ready",
        "staleness": {
            "added_image_count": 0,
            "removed_image_count": 0,
            "state": "current",
        },
        "viewer": {
            "open_href": "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384"
        },
        "artifacts": [
            {
                "byte_size": 3,
                "content_type": "application/x-jsonlines",
                "key": "manifest.jsonl",
                "required": True,
                "retention_class": "durable",
                "role": "image-manifest",
            },
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "layouts/dinov3_vits_384_umap.json",
                "required": True,
                "retention_class": "durable",
                "role": "layout",
            },
            {
                "byte_size": 5,
                "content_type": "application/octet-stream",
                "key": "indexes/dinov3_vits_384_flat_ip.faiss",
                "required": True,
                "retention_class": "durable",
                "role": "faiss-index",
            },
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "viewer/atlases/32px/atlas-manifest.json",
                "required": False,
                "retention_class": "render-cache",
                "role": "thumbnail-atlas",
            },
        ],
    }


def write_manifest_artifacts(data_root, manifest):
    result_dir = data_root / "analysis-results" / manifest["analysis_result_id"]
    for artifact in manifest["artifacts"]:
        path = result_dir / artifact["key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])


def write_manifest(data_root, manifest):
    result_dir = data_root / "analysis-results" / manifest["analysis_result_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    (result_dir / "analysis-result.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def test_registry_registers_loads_and_lists_browser_safe_summary(tmp_path):
    manifest = valid_manifest()
    write_manifest_artifacts(tmp_path, manifest)
    registry = LocalAnalysisResultRegistry(tmp_path)

    registered = registry.register(manifest)

    assert registry.load(manifest["analysis_result_id"]) == manifest
    assert registry.list() == [registered]
    assert registered.analysis_result_id == manifest["analysis_result_id"]
    assert registered.analysis_job_id == manifest["analysis_job_id"]
    assert registered.sibling_group_id == manifest["sibling_group_id"]
    assert registered.scope_snapshot_id == manifest["scope_snapshot"]["snapshot_id"]
    assert registered.scope_label == "Bread"
    assert registered.recipe_names == ["dinov3_vits_384"]
    assert registered.item_count == 2
    assert registered.status == "ready"
    assert registered.artifact_health == {
        "missing_optional_render_cache_artifact_keys": [],
        "missing_optional_artifact_keys": [],
        "missing_required_artifact_keys": [],
        "ready": True,
    }
    assert registered.storage_totals == {
        "durable": 10,
        "render-cache": 2,
        "total": 12,
        "viewer-cache": 0,
    }
    assert registered.export_readiness == {
        "export_safety": manifest["export_safety"],
        "ready": False,
        "state": "not_validated",
    }
    public_payload = registered.to_public_dict()
    assert public_payload["analysis_result_id"] == manifest["analysis_result_id"]
    assert str(tmp_path) not in json.dumps(public_payload)

    validation = registry.validate_result(manifest["analysis_result_id"])
    assert validation.analysis_result_id == manifest["analysis_result_id"]
    assert validation.manifest_valid is True
    assert validation.artifact_health == registered.artifact_health
    assert validation.storage_totals == registered.storage_totals
    assert str(tmp_path) not in json.dumps(validation.to_public_dict())


def test_registry_reports_missing_artifacts_separately_from_failed_state(tmp_path):
    manifest = valid_manifest()
    manifest["status"] = "failed"
    result_dir = tmp_path / "analysis-results" / manifest["analysis_result_id"]
    for artifact in manifest["artifacts"]:
        if artifact["key"] in {
            "layouts/dinov3_vits_384_umap.json",
            "viewer/atlases/32px/atlas-manifest.json",
        }:
            continue
        path = result_dir / artifact["key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])
    registry = LocalAnalysisResultRegistry(tmp_path)

    summary = registry.register(manifest)

    assert summary.status == "failed"
    assert summary.result_state == {
        "complete": False,
        "state": "failed",
    }
    assert summary.artifact_health == {
        "missing_optional_render_cache_artifact_keys": [
            "viewer/atlases/32px/atlas-manifest.json"
        ],
        "missing_optional_artifact_keys": [
            "viewer/atlases/32px/atlas-manifest.json"
        ],
        "missing_required_artifact_keys": ["layouts/dinov3_vits_384_umap.json"],
        "ready": False,
    }
    assert summary.explorer_readiness["ready"] is False
    assert summary.storage_totals == {
        "durable": 8,
        "render-cache": 0,
        "total": 8,
        "viewer-cache": 0,
    }


def test_registry_list_skips_optional_artifact_stats_but_strict_summary_reports_gaps(
    tmp_path,
    monkeypatch,
):
    manifest = valid_manifest()
    result_dir = tmp_path / "analysis-results" / manifest["analysis_result_id"]
    for artifact in manifest["artifacts"]:
        if not artifact["required"]:
            continue
        path = result_dir / artifact["key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])
    write_manifest(tmp_path, manifest)

    stat_keys = []
    original_stat = analysis_result_registry.LocalFilesystemArtifactStore.stat

    def counting_stat(self, namespace, key, **kwargs):
        stat_keys.append(key)
        return original_stat(self, namespace, key, **kwargs)

    monkeypatch.setattr(
        analysis_result_registry.LocalFilesystemArtifactStore,
        "stat",
        counting_stat,
    )
    registry = LocalAnalysisResultRegistry(tmp_path)

    list_summary = registry.list()[0]

    assert stat_keys == [
        "manifest.jsonl",
        "layouts/dinov3_vits_384_umap.json",
        "indexes/dinov3_vits_384_flat_ip.faiss",
    ]
    assert list_summary.artifact_health == {
        "missing_optional_artifact_keys": [],
        "missing_optional_render_cache_artifact_keys": [],
        "missing_required_artifact_keys": [],
        "ready": True,
    }
    assert list_summary.storage_totals == {
        "durable": 10,
        "render-cache": 2,
        "total": 12,
        "viewer-cache": 0,
    }

    strict_summary = registry.summarize(manifest["analysis_result_id"])

    assert strict_summary.artifact_health == {
        "missing_optional_artifact_keys": [
            "viewer/atlases/32px/atlas-manifest.json"
        ],
        "missing_optional_render_cache_artifact_keys": [
            "viewer/atlases/32px/atlas-manifest.json"
        ],
        "missing_required_artifact_keys": [],
        "ready": True,
    }
    assert strict_summary.storage_totals == {
        "durable": 10,
        "render-cache": 0,
        "total": 10,
        "viewer-cache": 0,
    }


def test_registry_treats_missing_viewer_cache_artifacts_as_not_explorer_ready(
    tmp_path,
):
    manifest = valid_manifest()
    manifest["artifacts"].extend(
        [
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "viewer/map-data.json",
                "required": True,
                "retention_class": "viewer-cache",
                "role": "viewer-data",
            },
            {
                "byte_size": 2,
                "content_type": "application/json",
                "key": "viewer/neighbors.json",
                "required": True,
                "retention_class": "viewer-cache",
                "role": "viewer-neighbors",
            },
        ]
    )
    result_dir = tmp_path / "analysis-results" / manifest["analysis_result_id"]
    for artifact in manifest["artifacts"]:
        if artifact["retention_class"] == "viewer-cache":
            continue
        path = result_dir / artifact["key"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * artifact["byte_size"])
    registry = LocalAnalysisResultRegistry(tmp_path)

    summary = registry.register(manifest)

    assert summary.artifact_health["missing_required_artifact_keys"] == [
        "viewer/map-data.json",
        "viewer/neighbors.json",
    ]
    assert summary.explorer_readiness["ready"] is False


def test_registry_rejects_unsafe_analysis_result_ids_before_writing(tmp_path):
    manifest = valid_manifest()
    manifest["analysis_result_id"] = "../escape"
    registry = LocalAnalysisResultRegistry(tmp_path)

    with pytest.raises(ArtifactStoreError):
        registry.register(manifest)

    assert not (tmp_path / "escape").exists()


def test_registry_groups_sibling_results_without_job_level_open_action(tmp_path):
    first = valid_manifest()
    second = json.loads(json.dumps(first))
    second["analysis_result_id"] = "analysis-result-20260614T130000Z-dinov3_vits_512"
    second["recipes"][0]["recipe_name"] = "dinov3_vits_512"
    second["viewer"]["open_href"] = (
        "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_512"
    )
    write_manifest_artifacts(tmp_path, first)
    write_manifest_artifacts(tmp_path, second)
    registry = LocalAnalysisResultRegistry(tmp_path)

    first_summary = registry.register(first)
    second_summary = registry.register(second)
    groups = registry.list_sibling_groups()

    assert groups[0].sibling_group_id == first["sibling_group_id"]
    assert groups[0].analysis_job_id == first["analysis_job_id"]
    assert groups[0].scope_snapshot_id == first["scope_snapshot"]["snapshot_id"]
    assert groups[0].analysis_result_ids == [
        first_summary.analysis_result_id,
        second_summary.analysis_result_id,
    ]
    assert groups[0].recipe_names == ["dinov3_vits_384", "dinov3_vits_512"]
    assert "open_href" not in groups[0].to_public_dict()
    assert str(tmp_path) not in json.dumps(groups[0].to_public_dict())
