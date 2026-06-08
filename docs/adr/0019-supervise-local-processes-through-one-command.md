# Supervise local processes through one command

The MVP starts the local app through one Anacronia command that supervises the Next.js UI, FastAPI backend, and Python worker. The command is responsible for choosing or reporting ports, surfacing health, keeping the worker idle when no Provider Search is active, and shutting down child processes coherently.

**Status:** accepted

**Considered Options:** Asking users to start three separate commands is simpler for development but violates the non-technical Mac setup goal. Launching the worker only per action would reduce idle process count but would weaken parked-resume state, health reporting, and stop/resume behavior.

**Consequences:** Process lifecycle, logs, health checks, port fallback, shutdown, and restart behavior belong in startup architecture, not ad hoc scripts. Future packaged apps may replace the terminal command with a launcher, but they still need equivalent supervision semantics.
