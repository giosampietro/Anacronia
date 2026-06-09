import pytest

from anacronia.cli import (
    acquire_data_root_runtime_lock,
    build_startup_plan,
    run_latent_map_faiss_build,
    run_latent_map_faiss_query,
    run_latent_map_embed,
    run_latent_map_init,
    run_latent_map_layout,
    run_latent_map_scan,
    validate_supported_runtime,
)
from anacronia.latent_map_scan import scan_latent_map_run


def test_no_open_prints_url_without_opening_browser(tmp_path):
    plan = build_startup_plan(
        no_open=True,
        ui_port=18660,
        api_port=18670,
        runtime_system="Darwin",
        runtime_machine="arm64",
        project_root=tmp_path,
    )

    assert plan.open_browser is False
    assert plan.ui_url == "http://localhost:18660"
    assert "http://localhost:18660" in plan.message


def test_startup_plan_uses_default_ports(tmp_path):
    plan = build_startup_plan(
        no_open=True,
        is_port_available=lambda port: True,
        runtime_system="Darwin",
        runtime_machine="arm64",
        project_root=tmp_path,
    )

    assert plan.ui_port == 18660
    assert plan.api_port == 18670


def test_startup_plan_includes_backend_worker_and_ui_services(tmp_path):
    plan = build_startup_plan(
        no_open=True,
        ui_port=18660,
        api_port=18670,
        runtime_system="Darwin",
        runtime_machine="arm64",
        project_root=tmp_path,
    )

    assert [service.name for service in plan.services] == [
        "FastAPI backend",
        "Python worker",
        "Next.js UI",
    ]
    assert "anacronia.api:create_app" in plan.services[0].command
    assert "--factory" in plan.services[0].command
    assert plan.services[0].command[-5:] == [
        "--port",
        "18670",
        "--log-level",
        "info",
        "--factory",
    ]
    assert plan.services[1].command[-1:] == ["anacronia.worker"]
    assert plan.services[2].setup_command[-1] == "build"
    assert "start" in plan.services[2].command
    assert plan.services[2].environment["ANACRONIA_API_PORT"] == "18670"
    assert plan.services[2].environment["ANACRONIA_UI_PORT"] == "18660"
    assert plan.services[2].environment["NEXT_SWC_PATH"].endswith("data/temp/next-swc")


def test_startup_plan_initializes_configured_storage_and_shares_data_root(tmp_path):
    data_root = tmp_path / "external-data"

    plan = build_startup_plan(
        no_open=True,
        ui_port=18660,
        api_port=18670,
        runtime_system="Darwin",
        runtime_machine="arm64",
        project_root=tmp_path / "project",
        environment={"ANACRONIA_DATA_ROOT": str(data_root)},
    )

    assert plan.data_root == data_root
    assert plan.database_path == data_root / "anacronia.sqlite"
    assert plan.database_path.is_file()
    assert [service.environment["ANACRONIA_DATA_ROOT"] for service in plan.services] == [
        str(data_root),
        str(data_root),
        str(data_root),
    ]
    assert plan.services[2].environment["NEXT_SWC_PATH"] == str(data_root / "temp" / "next-swc")


def test_runtime_lock_blocks_duplicate_local_stack_for_same_data_root(tmp_path):
    first_lock = acquire_data_root_runtime_lock(tmp_path)

    try:
        with pytest.raises(RuntimeError, match="already running"):
            acquire_data_root_runtime_lock(tmp_path)
    finally:
        first_lock.close()

    second_lock = acquire_data_root_runtime_lock(tmp_path)
    second_lock.close()


def test_runtime_requires_apple_silicon_mac():
    with pytest.raises(RuntimeError, match="Apple Silicon"):
        validate_supported_runtime(system="Darwin", machine="x86_64")

    with pytest.raises(RuntimeError, match="macOS"):
        validate_supported_runtime(system="Linux", machine="arm64")


def test_latent_map_init_cli_prints_run_summary(tmp_path, capsys):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()

    run_latent_map_init(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
    )

    output = capsys.readouterr().out
    assert '"run_id"' in output
    assert '"config_path"' in output
    assert str(source_folder.resolve()) in output


def test_latent_map_scan_cli_prints_scan_summary(tmp_path, capsys):
    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run_latent_map_init(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
    )
    run_dir = next((tmp_path / "runs").iterdir())

    run_latent_map_scan(run_dir=run_dir)

    output = capsys.readouterr().out
    assert '"supported_file_count": 0' in output
    assert '"manifest_image_count": 0' in output


def test_latent_map_embed_cli_prints_embedding_summary(tmp_path, capsys):
    class FakeEmbedder:
        model_id = "fake-embedder"
        device = "fake"

        def embed_batch(self, images):
            return [[float(image.width), float(image.height)] for image in images]

    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run_latent_map_init(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
    )
    run_dir = next((tmp_path / "runs").iterdir())
    scan_latent_map_run(run_dir)

    run_latent_map_embed(
        run_dir=run_dir,
        recipe_name="dinov3_vits_256",
        batch_size=8,
        limit=None,
        embedder=FakeEmbedder(),
    )

    output = capsys.readouterr().out
    assert '"recipe_name": "dinov3_vits_256"' in output
    assert '"vector_count": 0' in output


def test_latent_map_faiss_cli_prints_build_and_query_summaries(tmp_path, capsys):
    import json

    import numpy as np

    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run_latent_map_init(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
    )
    run_dir = next((tmp_path / "runs").iterdir())
    rows = [
        {"image_id": "img-a", "source_path": str(source_folder / "a.jpg"), "relative_path": "a.jpg"},
        {"image_id": "img-b", "source_path": str(source_folder / "b.jpg"), "relative_path": "b.jpg"},
    ]
    (run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )
    embeddings_dir = run_dir / "embeddings"
    embeddings_dir.mkdir(exist_ok=True)
    np.save(
        embeddings_dir / "dinov3_vits_256.npy",
        np.asarray([[1.0, 0.0], [0.8, 0.2]], dtype=np.float32),
    )

    run_latent_map_faiss_build(
        run_dir=run_dir,
        recipe_name="dinov3_vits_256",
        top_k=2,
    )
    run_latent_map_faiss_query(
        run_dir=run_dir,
        recipe_name="dinov3_vits_256",
        image_id="img-a",
        top_k=1,
        include_self=False,
    )

    output = capsys.readouterr().out
    assert '"index_kind": "IndexFlatIP"' in output
    assert '"image_id": "img-b"' in output


def test_latent_map_layout_cli_prints_layout_summary(tmp_path, capsys):
    import json

    import numpy as np

    class FakeReducer:
        def fit_transform(self, vectors):
            return vectors[:, :2]

    class FakeClusterer:
        def fit_predict(self, vectors):
            return np.arange(vectors.shape[0]) % 3

    source_folder = tmp_path / "source-images"
    source_folder.mkdir()
    run_latent_map_init(
        source_folder=source_folder,
        runs_root=tmp_path / "runs",
        run_name="J Shoot",
    )
    run_dir = next((tmp_path / "runs").iterdir())
    rows = [
        {"image_id": f"img-{index}", "source_path": str(source_folder / f"{index}.jpg"), "relative_path": f"{index}.jpg"}
        for index in range(6)
    ]
    (run_dir / "manifest.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )
    embeddings_dir = run_dir / "embeddings"
    embeddings_dir.mkdir(exist_ok=True)
    np.save(
        embeddings_dir / "dinov3_vits_256.npy",
        np.asarray(
            [
                [1.0, 0.0, 0.0],
                [0.9, 0.1, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.9, 0.1],
                [0.0, 0.0, 1.0],
                [0.1, 0.0, 0.9],
            ],
            dtype=np.float32,
        ),
    )

    run_latent_map_layout(
        run_dir=run_dir,
        recipe_name="dinov3_vits_256",
        n_neighbors=4,
        min_dist=0.05,
        cluster_count=3,
        random_state=42,
        reducer=FakeReducer(),
        clusterer=FakeClusterer(),
    )

    output = capsys.readouterr().out
    assert '"point_count": 6' in output
    assert '"cluster_count": 3' in output
