from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

import anacronia.local_folder_picker as picker


def completed_process(
    command: list[str],
    *,
    returncode: int,
    stdout: str = "",
    stderr: str = "",
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        command,
        returncode,
        stdout=stdout,
        stderr=stderr,
    )


def test_folder_picker_uses_applescript_selected_path_despite_noisy_stderr(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        return completed_process(
            command,
            returncode=0,
            stdout="/Users/giorgio/Desktop/references\n",
            stderr="2026-06-07 osascript diagnostic that should be ignored",
        )

    monkeypatch.setattr(picker.subprocess, "run", fake_run)

    assert picker.choose_local_folder_path() == Path("/Users/giorgio/Desktop/references")
    assert len(calls) == 1
    assert calls[0][0] == "osascript"
    assert "-l" not in calls[0]


def test_folder_picker_falls_back_from_applescript_to_jxa(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        if "-l" not in command:
            return completed_process(
                command,
                returncode=1,
                stderr="Connection Invalid error for service com.apple.hiservices-xpcservice",
            )
        return completed_process(
            command,
            returncode=0,
            stdout="/Users/giorgio/Desktop/fallback-references\n",
        )

    monkeypatch.setattr(picker.subprocess, "run", fake_run)

    assert picker.choose_local_folder_path() == Path(
        "/Users/giorgio/Desktop/fallback-references"
    )
    assert len(calls) == 2
    assert calls[0][0] == "osascript"
    assert "-l" not in calls[0]
    assert calls[1][:3] == ["osascript", "-l", "JavaScript"]


def test_folder_picker_never_exposes_native_diagnostics_when_unavailable(monkeypatch):
    native_diagnostic = (
        "2026-06-07 osascript[56029:18091055] Connection Invalid error for "
        "service com.apple.hiservices-xpcservice. HostCallsAuxiliary: Connection invalid"
    )

    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return completed_process(command, returncode=1, stderr=native_diagnostic)

    monkeypatch.setattr(picker.subprocess, "run", fake_run)

    with pytest.raises(picker.LocalFolderPickerUnavailable) as error:
        picker.choose_local_folder_path()

    assert str(error.value) == picker.PICKER_UNAVAILABLE_MESSAGE
    assert "osascript" not in str(error.value)
    assert "Connection Invalid" not in str(error.value)
    assert "HostCallsAuxiliary" not in str(error.value)


def test_folder_picker_cancelled_applescript_panel_does_not_fall_back(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        return completed_process(
            command,
            returncode=1,
            stderr="User canceled. (-128)",
        )

    monkeypatch.setattr(picker.subprocess, "run", fake_run)

    with pytest.raises(picker.LocalFolderPickerCancelled):
        picker.choose_local_folder_path()

    assert len(calls) == 1


def test_failed_folder_picker_stdout_is_not_treated_as_a_folder_path(monkeypatch):
    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        return completed_process(
            command,
            returncode=1,
            stdout="/Users/giorgio/Desktop/not-actually-selected\n",
            stderr="Connection Invalid",
        )

    monkeypatch.setattr(picker.subprocess, "run", fake_run)

    with pytest.raises(picker.LocalFolderPickerUnavailable):
        picker.choose_local_folder_path()
