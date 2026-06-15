import json
import threading
import time
from datetime import datetime, timezone

import pytest
from PIL import Image

from anacronia.analysis_jobs import (
    ANALYSIS_JOB_MANIFEST_NAME,
    AnalysisJobBusyError,
    AnalysisStageArtifact,
    AnalysisStageResult,
    submit_analysis_job,
)
from anacronia.local_folder_import import create_local_folder_collection
from anacronia.storage import initialize_storage


def write_image(path, *, color=(40, 130, 180)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (640, 320), color=color).save(path)


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


class BlockingStageRunner:
    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()
        self.calls = []

    def run_stage(self, request):
        self.calls.append((request.stage_name, request.recipe.recipe_id))
        self.started.set()
        if not self.release.wait(timeout=5):
            raise RuntimeError("blocking stage runner was not released")
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


def read_job_manifest(storage, analysis_job_id):
    manifest_path = (
        storage.data_root
        / "analysis-jobs"
        / analysis_job_id
        / ANALYSIS_JOB_MANIFEST_NAME
    )
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def wait_for_job_status(storage, analysis_job_id, status, *, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        manifest = read_job_manifest(storage, analysis_job_id)
        if manifest["status"] == status:
            return manifest
        time.sleep(0.02)
    raise AssertionError(f"Analysis job did not reach {status!r}.")


def test_analysis_job_submission_returns_running_manifest_before_stage_work(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = BlockingStageRunner()

    summary = submit_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["analysis-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 15, 9, 30, tzinfo=timezone.utc),
    )

    assert summary.status == "running"
    assert summary.recipe_ids == ["dinov3_vits_384"]
    assert summary.analysis_result_ids == []
    running_manifest = read_job_manifest(storage, summary.analysis_job_id)
    assert running_manifest["status"] == "running"
    assert running_manifest["stages"] == []
    assert stage_runner.started.wait(timeout=2)

    stage_runner.release.set()

    ready_manifest = wait_for_job_status(
        storage,
        summary.analysis_job_id,
        "ready",
    )
    assert ready_manifest["analysis_result_ids"] == [
        "analysis-result-20260615T093000Z-dinov3_vits_384"
    ]
    assert [call[0] for call in stage_runner.calls] == [
        "embedding_computation",
        "faiss",
        "umap",
        "hdbscan",
        "atlas_generation",
    ]


def test_analysis_job_submission_rejects_second_active_job(tmp_path):
    storage = create_collection(tmp_path)
    stage_runner = BlockingStageRunner()
    first = submit_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["analysis-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 15, 9, 45, tzinfo=timezone.utc),
    )
    assert stage_runner.started.wait(timeout=2)

    with pytest.raises(AnalysisJobBusyError) as error:
        submit_analysis_job(
            database_path=storage.database_path,
            data_root=storage.data_root,
            collection_slugs=["analysis-board"],
            recipe_ids=["dinov3_vits_256"],
            stage_runner=BlockingStageRunner(),
            created_at=datetime(2026, 6, 15, 9, 46, tzinfo=timezone.utc),
        )

    assert error.value.active_analysis_job_id == first.analysis_job_id

    stage_runner.release.set()
    wait_for_job_status(storage, first.analysis_job_id, "ready")


def test_analysis_job_submission_recovers_stale_running_job_before_locking(tmp_path):
    storage = create_collection(tmp_path)
    stale_manifest_path = (
        storage.data_root
        / "analysis-jobs"
        / "analysis-job-20260615T080000Z"
        / ANALYSIS_JOB_MANIFEST_NAME
    )
    stale_manifest_path.parent.mkdir(parents=True)
    stale_manifest_path.write_text(
        json.dumps(
            {
                "asset_kind": "analysis-job",
                "analysis_job_id": "analysis-job-20260615T080000Z",
                "analysis_result_ids": [],
                "created_at": "2026-06-15T08:00:00Z",
                "recipe_ids": ["dinov3_vits_384"],
                "sibling_group_id": "analysis-sibling-20260615T080000Z",
                "stages": [],
                "status": "running",
            }
        ),
        encoding="utf-8",
    )
    stage_runner = BlockingStageRunner()

    submitted = submit_analysis_job(
        database_path=storage.database_path,
        data_root=storage.data_root,
        collection_slugs=["analysis-board"],
        recipe_ids=["dinov3_vits_384"],
        stage_runner=stage_runner,
        created_at=datetime(2026, 6, 15, 8, 30, tzinfo=timezone.utc),
        stale_after_seconds=60,
    )

    stale_manifest = json.loads(stale_manifest_path.read_text(encoding="utf-8"))
    assert stale_manifest["status"] == "failed"
    assert "stale running state" in stale_manifest["stages"][-1]["error"]
    assert submitted.status == "running"

    stage_runner.release.set()
    wait_for_job_status(storage, submitted.analysis_job_id, "ready")
