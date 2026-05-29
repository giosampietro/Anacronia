# Batch Commands

These files are for running local Anacronia without typing terminal commands.

On macOS, double-click a `.command` file from Finder. A Terminal window will open, run the steps, and wait before closing so you can read the result.

- `open-anacronia.command` is the daily-use button: it opens Anacronia in your browser if it is already running, or starts it and opens the browser when ready.
- `setup-local-environment.command` rebuilds the local Python environment with Python 3.12 and installs Python dependencies.
- `verify-bootstrap.command` runs the current Python and web checks. It does not open the app.
- `start-anacronia.command` starts the local app and opens the browser when ready.
