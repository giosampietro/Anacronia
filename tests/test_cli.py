import pytest

from anacronia.cli import build_startup_plan, validate_supported_runtime


def test_no_open_prints_url_without_opening_browser():
    plan = build_startup_plan(
        no_open=True,
        ui_port=18660,
        api_port=18670,
        runtime_system="Darwin",
        runtime_machine="arm64",
    )

    assert plan.open_browser is False
    assert plan.ui_url == "http://localhost:18660"
    assert "http://localhost:18660" in plan.message


def test_startup_plan_uses_default_ports():
    plan = build_startup_plan(
        no_open=True,
        is_port_available=lambda port: True,
        runtime_system="Darwin",
        runtime_machine="arm64",
    )

    assert plan.ui_port == 18660
    assert plan.api_port == 18670


def test_startup_plan_includes_backend_worker_and_ui_services():
    plan = build_startup_plan(
        no_open=True,
        ui_port=18660,
        api_port=18670,
        runtime_system="Darwin",
        runtime_machine="arm64",
    )

    assert [service.name for service in plan.services] == [
        "FastAPI backend",
        "Python worker",
        "Next.js UI",
    ]
    assert plan.services[0].command[-4:] == ["--port", "18670", "--log-level", "info"]
    assert plan.services[1].command[-1:] == ["anacronia.worker"]
    assert plan.services[2].setup_command[-1] == "build"
    assert "start" in plan.services[2].command
    assert plan.services[2].environment["ANACRONIA_API_PORT"] == "18670"
    assert plan.services[2].environment["ANACRONIA_UI_PORT"] == "18660"
    assert plan.services[2].environment["NEXT_SWC_PATH"].endswith("data/temp/next-swc")


def test_runtime_requires_apple_silicon_mac():
    with pytest.raises(RuntimeError, match="Apple Silicon"):
        validate_supported_runtime(system="Darwin", machine="x86_64")

    with pytest.raises(RuntimeError, match="macOS"):
        validate_supported_runtime(system="Linux", machine="arm64")
