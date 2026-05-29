import pytest

from anacronia.cli import build_startup_plan, validate_supported_runtime


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


def test_runtime_requires_apple_silicon_mac():
    with pytest.raises(RuntimeError, match="Apple Silicon"):
        validate_supported_runtime(system="Darwin", machine="x86_64")

    with pytest.raises(RuntimeError, match="macOS"):
        validate_supported_runtime(system="Linux", machine="arm64")
