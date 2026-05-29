import time


def create_idle_worker_status() -> dict[str, str]:
    return {"service": "worker", "status": "idle"}


def main() -> None:
    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()
