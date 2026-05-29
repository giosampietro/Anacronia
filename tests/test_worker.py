from anacronia.worker import create_idle_worker_status


def test_worker_starts_idle():
    assert create_idle_worker_status() == {"service": "worker", "status": "idle"}
