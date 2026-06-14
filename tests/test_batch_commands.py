from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_latent_map_launchers_do_not_use_runtime_root_as_app_data_root() -> None:
    launcher_paths = [
        PROJECT_ROOT / "batch-cmd" / "start-latent-map-j-shoot.command",
        PROJECT_ROOT / "batch-cmd" / "start-latent-map-j-shoot-dev.command",
        PROJECT_ROOT / "batch-cmd" / "verify-durable-latent-map-j-shoot.command",
    ]

    for launcher_path in launcher_paths:
        script = launcher_path.read_text(encoding="utf-8")

        assert 'APP_DATA_ROOT="$WORKTREE_ROOT/data"' in script
        assert 'export ANACRONIA_DATA_ROOT="$APP_DATA_ROOT"' in script
        assert "anacronia.api:create_app" in script
        assert 'export ANACRONIA_DATA_ROOT="$WORKTREE_DATA_ROOT"' not in script
        assert 'export ANACRONIA_DATA_ROOT="$WORKTREE_RUNTIME_ROOT"' not in script
