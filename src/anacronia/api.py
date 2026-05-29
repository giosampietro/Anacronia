from fastapi import FastAPI

from anacronia.worker import create_idle_worker_status


def create_app() -> FastAPI:
    app = FastAPI(title="Anacronia")

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "service": "api",
            "status": "ok",
            "worker": create_idle_worker_status(),
        }

    return app


app = create_app()
