import json
from datetime import datetime, timezone

from PIL import Image

from anacronia.analysis_jobs import (
    AnalysisStageArtifact,
    AnalysisStageResult,
    run_analysis_job,
)
from anacronia.analysis_result_contract import (
    assert_analysis_result_manifest_contract,
    browser_safe_analysis_result_summary,
)
from anacronia.analysis_recipes import get_analysis_recipe
from anacronia.analysis_scopes import resolve_analysis_scope
from anacronia.image_embedding_results import record_image_embedding_result
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, size=(640, 320), color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color=color).save(path)


def create_collection(tmp_path, *, display_name="Analysis Board"):
    storage = initialize_storage(project_root=tmp_path)
    folder = tmp_path / "incoming"
    write_image(folder / "a.jpg", color=(10, 20, 30))
    write_image(folder / "b.jpg", color=(40, 50, 60))
    create_local_folder_collection(
        database_path=storage.database_path,
        data_root=storage.data_root,
        display_name=display_name,
        folder_path=folder,
    )
    return storage


class FakeStageRunner:
    def __init__(self, *, fail_stage=None, fail_recipe_id=None):
        self.calls = []
        self.fail_stage = fail_stage
        self.fail_recipe_id = fail_recipe_id

    def run_stage(self, request):
        self.calls.append(
            (
                request.stage_name,
                request.recipe.recipe_id,
                request.embedding_plan.missing_image_asset_ids,
            )
        )
        if (
            request.stage_name == self.fail_stage
            and request.recipe.recipe_id == self.fail_recipe_id
        ):
            raise RuntimeError("stage exploded")

        artifact = {
            "embedding_computation": AnalysisStageArtifact(
                key=f"embeddings/{request.recipe.recipe_id}.npy",
                role="embedding",
                content_type="application/octet-stream",
                retention_class="durable",
            ),
            "faiss": AnalysisStageArtifact(
                key=f"indexes/{request.recipe.recipe_id}_flat_ip.faiss",
                role="faiss-index",
                content_type="application/octet-stream",
                retention_class="durable",
            ),
            "umap": AnalysisStageArtifact(
                key=f"layouts/{request.recipe.recipe_id}_umap_default.json",
                role="layout",
                content_type="application/json",
                retention_class="durable",
                metadata={"layout_id": "umap_default"},
            ),
            "hdbscan": AnalysisStageArtifact(
                key=f"clusters/{request.recipe.recipe_id}_hdbscan_default.json",
                role="cluster-result",
                content_type="application/json",
                retention_class="durable",
                metadata={"cluster_id": "hdbscan_default"},
            ),
            "atlas_generation": AnalysisStageArtifact(
                key="viewer/atlases/32px/atlas-manifest.json",
                role="thumbnail-atlas",
                content_type="application/json",
                retention_class="render-cache",
            ),
        }[request.stage_name]
        artifact_path = request.analysis_result_dir / artifact.key
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text("{}", encoding="utf-8")
        return AnalysisStageResult(artifacts=[artifact])


def test_analysis_job_writes_scope_plan_default_recipe_and_openable_result(tmp_path):
    storage = create_collection(tmp_path)
    resolved_scope = resolve_analysis_scope(
        database_path=storage.database_path,
        collection_slugs=["analysis-board"],
    )
    reusable_item = resolved_scope.payload["items"][0]
    recipe = get_analysis_recipe("dinov3_vits_384")
    reusable_embedding = record_image_embedding_result(
        data_root=storage.data_root,
        image_asset_id=reusable_item["image_asset_id"],
        source_identity=reusable_item["source_identity"],
        recipe=recipe,
        artifact_key="image-embeddings/dinov3_vits_384/reusable.npy",
        vector_dimension=384,
        created_at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc),
    )
    stage_runner = FakeStageRunner()

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["analysis-board"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 14, 13, 0, tzinfo=timezone.utc),
    )

    assert job.status == "ready"
    assert job.recipe_ids == ["dinov3_vits_384"]
    assert len(job.analysis_result_ids) == 1
    assert [call[0] for call in stage_runner.calls] == [
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
    ]
    assert stage_runner.calls[0][2] == [
        resolved_scope.payload["items"][1]["image_asset_id"]
    ]

    result_id = job.analysis_result_ids[0]
    result_dir = storage.data_root / "analysis-results" / result_id
    manifest = json.loads((result_dir / "analysis-result.json").read_text())
    serialized = json.dumps(manifest)
    job_manifest = json.loads(job.manifest_path.read_text())

    assert job.manifest_path == (
        storage.data_root
        / "analysis-jobs"
        / job.analysis_job_id
        / "analysis-job.json"
    )
    assert job.scope_snapshot_id.startswith("analysis-scope-")
    assert manifest["asset_kind"] == "analysis-result-manifest"
    assert_analysis_result_manifest_contract(manifest)
    browser_summary = browser_safe_analysis_result_summary(manifest)
    assert browser_summary["analysis_result_id"] == result_id
    assert browser_summary["explorer_readiness"]["ready"] is True
    assert browser_summary["artifact_counts"] == {
        "durable": 7,
        "render-cache": 5,
        "total": 12,
        "viewer-cache": 0,
    }
    assert str(storage.data_root) not in json.dumps(browser_summary)
    assert manifest["analysis_result_id"] == result_id
    assert manifest["analysis_job_id"] == job.analysis_job_id
    assert manifest["sibling_group_id"] == job.sibling_group_id
    assert manifest["status"] == "ready"
    assert manifest["item_count"] == 2
    assert manifest["output_counts"]["artifacts"] == {
        "durable": 7,
        "render-cache": 5,
        "total": 12,
        "viewer-cache": 0,
    }
    assert manifest["explorer_readiness"] == {
        "missing_optional_artifact_keys": [],
        "missing_required_artifact_keys": [],
        "ready": True,
    }
    assert manifest["staleness"] == {
        "added_image_count": 0,
        "removed_image_count": 0,
        "state": "current",
    }
    assert manifest["export_safety"] == {
        "contains_local_absolute_paths": False,
        "contains_secrets": False,
        "contains_temporary_paths": False,
    }
    assert manifest["source"]["kind"] == "analysis-scope-snapshot"
    assert manifest["source"]["source_folder_name"] == "Analysis Board"
    assert manifest["scope_snapshot"]["snapshot_id"] == job.scope_snapshot_id
    assert manifest["recipes"][0]["recipe_name"] == "dinov3_vits_384"
    assert manifest["recipes"][0]["artifact_keys"] == {
        "baseline_atlas_manifest": "viewer/atlases/32px/atlas-manifest.json",
        "clusters": [
            {
                "cluster_id": "hdbscan_default",
                "key": "clusters/dinov3_vits_384_hdbscan_default.json",
            }
        ],
        "embedding_vectors": "embeddings/dinov3_vits_384.npy",
        "faiss_index": "indexes/dinov3_vits_384_flat_ip.faiss",
        "image_manifest": "manifest.jsonl",
        "layouts": [
            {
                "key": "layouts/dinov3_vits_384_umap_default.json",
                "layout_id": "umap_default",
            }
        ],
        "thumbnail_atlas_manifests": {
            "32": "viewer/atlases/32px/atlas-manifest.json"
        },
    }
    assert manifest["embedding_reuse"] == {
        "missing_count": 1,
        "reusable_count": 1,
        "reusable_image_embedding_result_ids": [
            reusable_embedding.image_embedding_result_id,
        ],
    }
    assert manifest["viewer"] == {
        "open_href": f"/latent-map?analysisResultId={result_id}"
    }
    assert job_manifest["stages"][0]["stage_name"] == "scope_snapshot"
    assert job_manifest["stages"][-1]["stage_name"] == "result_registration"
    assert str(tmp_path) not in serialized


def test_analysis_job_runs_multiple_recipes_as_sibling_results(tmp_path):
    storage = create_collection(tmp_path, display_name="Sibling Board")
    stage_runner = FakeStageRunner()

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["sibling-board"],
        recipe_ids=["dinov3_vits_256", "dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 14, 13, 15, tzinfo=timezone.utc),
    )

    assert job.status == "ready"
    assert job.recipe_ids == ["dinov3_vits_256", "dinov3_vits_384"]
    assert len(job.analysis_result_ids) == 2
    assert [call[:2] for call in stage_runner.calls] == [
        ("embedding_computation", "dinov3_vits_256"),
        ("faiss", "dinov3_vits_256"),
        ("umap", "dinov3_vits_256"),
        ("hdbscan", "dinov3_vits_256"),
        ("atlas_generation", "dinov3_vits_256"),
        ("embedding_computation", "dinov3_vits_384"),
        ("faiss", "dinov3_vits_384"),
        ("umap", "dinov3_vits_384"),
        ("hdbscan", "dinov3_vits_384"),
        ("atlas_generation", "dinov3_vits_384"),
    ]

    manifests = [
        json.loads(
            (
                storage.data_root
                / "analysis-results"
                / analysis_result_id
                / "analysis-result.json"
            ).read_text()
        )
        for analysis_result_id in job.analysis_result_ids
    ]
    assert {manifest["recipes"][0]["recipe_name"] for manifest in manifests} == {
        "dinov3_vits_256",
        "dinov3_vits_384",
    }
    assert {manifest["sibling_group_id"] for manifest in manifests} == {
        job.sibling_group_id
    }
    assert all(
        manifest["viewer"]["open_href"]
        == f"/latent-map?analysisResultId={manifest['analysis_result_id']}"
        for manifest in manifests
    )


def test_analysis_job_records_failed_stage_without_deleting_completed_sibling(tmp_path):
    storage = create_collection(tmp_path, display_name="Failure Board")
    stage_runner = FakeStageRunner(
        fail_stage="umap",
        fail_recipe_id="dinov3_vits_384",
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["failure-board"],
        recipe_ids=["dinov3_vits_256", "dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 14, 13, 30, tzinfo=timezone.utc),
    )

    assert job.status == "partial_failed"
    assert job.analysis_result_ids == [
        "analysis-result-20260614T133000Z-dinov3_vits_256"
    ]
    completed_result_manifest = (
        storage.data_root
        / "analysis-results"
        / job.analysis_result_ids[0]
        / "analysis-result.json"
    )
    failed_result_manifest = (
        storage.data_root
        / "analysis-results"
        / "analysis-result-20260614T133000Z-dinov3_vits_384"
        / "analysis-result.json"
    )
    job_manifest = json.loads(job.manifest_path.read_text())

    assert completed_result_manifest.is_file()
    assert not failed_result_manifest.exists()
    assert job_manifest["status"] == "partial_failed"
    assert {
        "error": "stage exploded",
        "recipe_id": "dinov3_vits_384",
        "stage_name": "umap",
        "status": "failed",
    }.items() <= job_manifest["stages"][-1].items()


def test_analysis_job_reports_partial_failure_when_later_sibling_completes(tmp_path):
    storage = create_collection(tmp_path, display_name="First Failure Board")
    stage_runner = FakeStageRunner(
        fail_stage="umap",
        fail_recipe_id="dinov3_vits_256",
    )

    job = run_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["first-failure-board"],
        recipe_ids=["dinov3_vits_256", "dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 14, 13, 45, tzinfo=timezone.utc),
    )

    job_manifest = json.loads(job.manifest_path.read_text())

    assert job.status == "partial_failed"
    assert job.analysis_result_ids == [
        "analysis-result-20260614T134500Z-dinov3_vits_384"
    ]
    assert job_manifest["status"] == "partial_failed"
