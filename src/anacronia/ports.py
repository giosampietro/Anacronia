from collections.abc import Callable
import socket


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_port(
    default_port: int,
    *,
    is_port_available: Callable[[int], bool] = is_port_available,
) -> int:
    port = default_port
    while not is_port_available(port):
        port += 1
    return port
