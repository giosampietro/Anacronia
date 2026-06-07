from __future__ import annotations

from pathlib import Path
import subprocess


class LocalFolderPickerCancelled(RuntimeError):
    pass


class LocalFolderPickerUnavailable(RuntimeError):
    pass


def choose_local_folder_path() -> Path:
    prompt = escape_applescript_string("Choose a folder of images to import")
    script = f'POSIX path of (choose folder with prompt "{prompt}")'
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            check=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise LocalFolderPickerUnavailable("macOS folder picker is not available.") from error
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip()
        if "User canceled" in stderr or "-128" in stderr:
            raise LocalFolderPickerCancelled("Folder selection was cancelled.") from error
        raise LocalFolderPickerUnavailable(
            stderr or "macOS folder picker failed."
        ) from error

    folder_path = result.stdout.strip()
    if folder_path == "":
        raise LocalFolderPickerCancelled("Folder selection was cancelled.")
    return Path(folder_path)


def escape_applescript_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
