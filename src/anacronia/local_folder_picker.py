from __future__ import annotations

import json
from pathlib import Path
import subprocess


PICKER_CANCELLED_MARKER = "__ANACRONIA_PICKER_CANCELLED__"
PICKER_UNAVAILABLE_MESSAGE = "Folder picker could not open. Paste the folder path manually."


class LocalFolderPickerCancelled(RuntimeError):
    pass


class LocalFolderPickerUnavailable(RuntimeError):
    pass


def choose_local_folder_path() -> Path:
    try:
        return choose_local_folder_path_with_jxa()
    except LocalFolderPickerCancelled:
        raise
    except LocalFolderPickerUnavailable:
        return choose_local_folder_path_with_applescript()


def choose_local_folder_path_with_jxa() -> Path:
    prompt = json.dumps("Choose a folder of images to import")
    script = f"""
ObjC.import("AppKit");

const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
app.activateIgnoringOtherApps(true);

const panel = $.NSOpenPanel.openPanel;
panel.message = {prompt};
panel.canChooseFiles = false;
panel.canChooseDirectories = true;
panel.allowsMultipleSelection = false;
panel.canCreateDirectories = false;

const response = panel.runModal();
if (response == $.NSModalResponseOK || response == 1) {{
  const url = panel.URL;
  if (url) {{
    console.log(ObjC.unwrap(url.path));
    $.exit(0);
  }}
}}

console.log("{PICKER_CANCELLED_MARKER}");
$.exit(2);
"""
    result = run_osascript(["osascript", "-l", "JavaScript", "-e", script])
    return parse_folder_picker_result(result, cancellation_markers=[PICKER_CANCELLED_MARKER])


def choose_local_folder_path_with_applescript() -> Path:
    prompt = escape_applescript_string("Choose a folder of images to import")
    script = (
        'tell application "Finder" to activate\n'
        f'POSIX path of (choose folder with prompt "{prompt}")'
    )
    result = run_osascript(["osascript", "-e", script])
    return parse_folder_picker_result(
        result,
        cancellation_markers=["User canceled", "-128"],
    )


def run_osascript(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
        )
    except FileNotFoundError as error:
        raise LocalFolderPickerUnavailable(PICKER_UNAVAILABLE_MESSAGE) from error


def parse_folder_picker_result(
    result: subprocess.CompletedProcess[str],
    *,
    cancellation_markers: list[str],
) -> Path:
    stdout = result.stdout.strip()
    stderr = result.stderr.strip()

    if any(marker == stdout or marker in stderr for marker in cancellation_markers):
        raise LocalFolderPickerCancelled("Folder selection was cancelled.")

    if result.returncode == 0 and stdout != "":
        return Path(stdout.splitlines()[0].strip())

    raise LocalFolderPickerUnavailable(PICKER_UNAVAILABLE_MESSAGE)


def escape_applescript_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
