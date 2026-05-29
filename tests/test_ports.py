from anacronia.ports import choose_port


def test_choose_port_uses_default_when_available():
    assert choose_port(18660, is_port_available=lambda port: port == 18660) == 18660


def test_choose_port_falls_back_incrementally():
    unavailable = {18660, 18661}

    assert choose_port(18660, is_port_available=lambda port: port not in unavailable) == 18662
