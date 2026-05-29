import json
from typing import Callable
from urllib.parse import urlencode
from urllib.request import urlopen


MET_COLLECTION_API_BASE_URL = "https://collectionapi.metmuseum.org/public/collection/v1"


def fetch_json_url(url: str) -> dict[str, object]:
    with urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


class HttpMetCandidateClient:
    def __init__(
        self,
        *,
        fetch_json: Callable[[str], dict[str, object]] = fetch_json_url,
        base_url: str = MET_COLLECTION_API_BASE_URL,
    ) -> None:
        self.fetch_json = fetch_json
        self.base_url = base_url.rstrip("/")

    def search_object_ids(self, term: str) -> list[int]:
        query_string = urlencode({"hasImages": "true", "q": term})
        payload = self.fetch_json(f"{self.base_url}/search?{query_string}")
        object_ids = payload.get("objectIDs")

        if not isinstance(object_ids, list):
            return []

        return [int(object_id) for object_id in object_ids]
