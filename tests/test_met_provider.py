import json

from anacronia.met_provider import HttpMetCandidateClient


def test_met_candidate_client_searches_met_object_ids_with_images():
    requested_urls: list[str] = []

    def fetch_json(url: str) -> dict[str, object]:
        requested_urls.append(url)
        return {"objectIDs": [436535, 436121]}

    client = HttpMetCandidateClient(fetch_json=fetch_json)

    object_ids = client.search_object_ids("garden snake")

    assert object_ids == [436535, 436121]
    assert requested_urls == [
        "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=garden+snake"
    ]


def test_met_candidate_client_handles_empty_met_results():
    client = HttpMetCandidateClient(
        fetch_json=lambda _url: json.loads('{"total": 0, "objectIDs": null}')
    )

    assert client.search_object_ids("not a likely term") == []
