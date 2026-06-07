from __future__ import annotations

import json
import time
from typing import Callable
from urllib.parse import quote, urlencode
from urllib.request import urlopen


VAM_COLLECTION_API_BASE_URL = "https://api.vam.ac.uk/v2"
DEFAULT_VAM_PAGE_SIZE = 100
DEFAULT_VAM_MAX_SEARCH_PAGES = 10
DEFAULT_VAM_REQUEST_DELAY_SECONDS = 1.0


def fetch_json_url(url: str) -> dict[str, object]:
    with urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


class HttpVamClient:
    def __init__(
        self,
        *,
        fetch_json: Callable[[str], dict[str, object]] = fetch_json_url,
        base_url: str = VAM_COLLECTION_API_BASE_URL,
        page_size: int = DEFAULT_VAM_PAGE_SIZE,
        max_search_pages: int = DEFAULT_VAM_MAX_SEARCH_PAGES,
        request_delay_seconds: float = DEFAULT_VAM_REQUEST_DELAY_SECONDS,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.fetch_json = fetch_json
        self.base_url = base_url.rstrip("/")
        self.page_size = max(1, int(page_size))
        self.max_search_pages = max(1, int(max_search_pages))
        self.request_delay_seconds = max(0.0, float(request_delay_seconds))
        self.sleep = sleep

    def search_object_ids(self, term: str) -> list[str]:
        object_ids: list[str] = []
        seen_object_ids: set[str] = set()

        for page in range(1, self.max_search_pages + 1):
            query_string = urlencode(
                {
                    "q": term,
                    "images_exist": 1,
                    "page": page,
                    "page_size": self.page_size,
                }
            )
            payload = self.fetch_json(f"{self.base_url}/objects/search?{query_string}")
            records = payload.get("records")
            if not isinstance(records, list) or not records:
                break

            for record in records:
                if not isinstance(record, dict):
                    continue
                system_number = record.get("systemNumber")
                if not isinstance(system_number, str) or not system_number.strip():
                    continue
                source_object_id = system_number.strip()
                if source_object_id in seen_object_ids:
                    continue
                seen_object_ids.add(source_object_id)
                object_ids.append(source_object_id)

            info = payload.get("info")
            pages = info.get("pages") if isinstance(info, dict) else None
            if isinstance(pages, int) and page >= pages:
                break
            if page < self.max_search_pages and self.request_delay_seconds > 0:
                self.sleep(self.request_delay_seconds)

        return object_ids

    def fetch_object_record(self, object_id: str) -> dict[str, object]:
        return self.fetch_json(f"{self.base_url}/object/{quote(object_id, safe='')}")
