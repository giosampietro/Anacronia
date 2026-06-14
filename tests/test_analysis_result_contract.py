import pytest

from anacronia.analysis_result_contract import (
    AnalysisResultContractError,
    assert_analysis_result_manifest_contract,
    browser_safe_analysis_result_summary,
)


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
        "item_count": 1,
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
            "item_count": 1,
            "snapshot_id": "analysis-scope-20260614T130000Z",
            "snapshot_key": "analysis-scopes/analysis-scope-20260614T130000Z.json",
        },
        "sibling_group_id": "analysis-sibling-20260614T130000Z",
        "source": {"kind": "analysis-scope-snapshot"},
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
                "byte_size": 10,
                "content_type": "application/x-jsonlines",
                "key": "manifest.jsonl",
                "required": True,
                "retention_class": "durable",
                "role": "image-manifest",
            },
            {
                "byte_size": 10,
                "content_type": "application/json",
                "key": "layouts/dinov3_vits_384_umap.json",
                "required": True,
                "retention_class": "durable",
                "role": "layout",
            },
            {
                "byte_size": 10,
                "content_type": "application/octet-stream",
                "key": "indexes/dinov3_vits_384_flat_ip.faiss",
                "required": True,
                "retention_class": "durable",
                "role": "faiss-index",
            },
            {
                "byte_size": 10,
                "content_type": "application/json",
                "key": "viewer/atlases/32px/atlas-manifest.json",
                "required": False,
                "retention_class": "render-cache",
                "role": "thumbnail-atlas",
            },
        ],
    }


def test_contract_accepts_manifest_and_projects_browser_safe_summary():
    manifest = valid_manifest()

    assert_analysis_result_manifest_contract(manifest)
    summary = browser_safe_analysis_result_summary(manifest)

    assert summary["analysis_result_id"] == manifest["analysis_result_id"]
    assert summary["artifact_counts"] == {
        "durable": 3,
        "render-cache": 1,
        "total": 4,
    }
    assert summary["artifacts"][0] == {
        "byte_size": 10,
        "content_type": "application/x-jsonlines",
        "key": "manifest.jsonl",
        "required": True,
        "retention_class": "durable",
        "role": "image-manifest",
    }


def test_contract_rejects_unsafe_artifact_keys():
    manifest = valid_manifest()
    manifest["artifacts"][0]["key"] = "../manifest.jsonl"

    with pytest.raises(AnalysisResultContractError):
        assert_analysis_result_manifest_contract(manifest)


def test_contract_rejects_local_paths_anywhere_in_manifest():
    manifest = valid_manifest()
    manifest["source"]["source_path"] = "/Users/giorgio/secret/source.jpg"

    with pytest.raises(AnalysisResultContractError):
        assert_analysis_result_manifest_contract(manifest)
