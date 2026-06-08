from anacronia.vam_provider import HttpVamClient


def test_vam_client_searches_object_ids_with_images_across_pages():
    requested_urls: list[str] = []

    def fetch_json(url: str) -> dict[str, object]:
        requested_urls.append(url)
        if "page=1" in url:
            return {
                "info": {"pages": 2},
                "records": [
                    {"systemNumber": "O9138"},
                    {"systemNumber": "O9139"},
                ],
            }
        return {
            "info": {"pages": 2},
            "records": [
                {"systemNumber": "O9139"},
                {"systemNumber": "MSL:1876:Forster:141:I"},
            ],
        }

    client = HttpVamClient(
        fetch_json=fetch_json,
        page_size=2,
        max_search_pages=2,
        request_delay_seconds=0,
    )

    object_ids = client.search_object_ids("great bed")

    assert object_ids == ["O9138", "O9139", "MSL:1876:Forster:141:I"]
    assert requested_urls == [
        "https://api.vam.ac.uk/v2/objects/search?q=great+bed&images_exist=1&page=1&page_size=2",
        "https://api.vam.ac.uk/v2/objects/search?q=great+bed&images_exist=1&page=2&page_size=2",
    ]


def test_vam_client_fetches_object_record_by_encoded_system_number():
    requested_urls: list[str] = []

    def fetch_json(url: str) -> dict[str, object]:
        requested_urls.append(url)
        return {"record": {"systemNumber": "MSL:1876:Forster:141:I"}}

    client = HttpVamClient(fetch_json=fetch_json)

    record = client.fetch_object_record("MSL:1876:Forster:141:I")

    assert record == {"record": {"systemNumber": "MSL:1876:Forster:141:I"}}
    assert requested_urls == [
        "https://api.vam.ac.uk/v2/object/MSL%3A1876%3AForster%3A141%3AI"
    ]
