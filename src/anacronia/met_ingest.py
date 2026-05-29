from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Protocol

from anacronia.collection_runs import ensure_collection_run_schema
from anacronia.search_sets import normalize_search_term
from anacronia.storage import met_raw_object_path


MET_PROVIDER = "met"
MET_VERIFIED_MATCH_FIELDS = [
    "title",
    "objectName",
    "tags",
    "medium",
    "culture",
    "period",
    "classification",
    "artistDisplayName",
]
MET_DESCRIPTOR_FIELD_TYPES = {
    "title": "title",
    "objectName": "object_name",
    "tags.term": "tag",
    "medium": "medium",
    "culture": "culture",
    "period": "period",
    "classification": "classification",
    "artistDisplayName": "artist",
    "department": "department",
    "objectDate": "date",
    "country": "place",
    "region": "place",
    "city": "place",
}


class MetRecordClient(Protocol):
    def fetch_object_record(self, object_id: int) -> dict[str, object]:
        pass


@dataclass(frozen=True)
class SkippedMetCandidate:
    object_id: int
    reason: str


@dataclass(frozen=True)
class MetIngestSummary:
    run_id: int
    fetched_object_ids: list[int]
    imported_object_ids: list[int]
    skipped_candidates: list[SkippedMetCandidate]


@dataclass(frozen=True)
class MetMuseumObject:
    object_id: int
    title: str
    object_name: str
    object_url: str
    raw_record_path: Path
    rights_and_reproduction: str
    metadata_date: str


@dataclass(frozen=True)
class MetMatch:
    object_id: int
    search_term: str
    verified: bool
    matched_fields: list[str]


@dataclass(frozen=True)
class MetDescriptor:
    object_id: int
    descriptor_type: str
    value: str
    source_field: str


def ingest_met_run(
    *,
    database_path: Path,
    data_root: Path,
    run_id: int,
    met_client: MetRecordClient,
) -> MetIngestSummary:
    fetched_object_ids: list[int] = []
    imported_object_ids: list[int] = []
    skipped_candidates: list[SkippedMetCandidate] = []

    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        run_candidates = get_run_candidates_for_ingest(connection=connection, run_id=run_id)

        for candidate in run_candidates:
            object_id = candidate["object_id"]
            record = met_client.fetch_object_record(object_id)
            fetched_object_ids.append(object_id)

            if record.get("isPublicDomain") is not True:
                skipped_candidates.append(
                    SkippedMetCandidate(object_id=object_id, reason="not_public_domain")
                )
                continue

            raw_record_path = write_met_raw_record(data_root=data_root, record=record)
            upsert_met_museum_object(
                connection=connection,
                record=record,
                raw_record_path=raw_record_path,
            )
            record_met_match(
                connection=connection,
                run_id=run_id,
                object_id=object_id,
                search_term=candidate["source_term"],
                matched_fields=matched_verified_fields(
                    record=record,
                    search_term=candidate["source_term"],
                ),
            )
            replace_met_descriptors(
                connection=connection,
                object_id=object_id,
                descriptors=extract_met_descriptors(record),
            )
            imported_object_ids.append(object_id)

    return MetIngestSummary(
        run_id=run_id,
        fetched_object_ids=fetched_object_ids,
        imported_object_ids=imported_object_ids,
        skipped_candidates=skipped_candidates,
    )


def get_met_museum_objects(*, database_path: Path) -> list[MetMuseumObject]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT
              object_id,
              title,
              object_name,
              object_url,
              raw_record_path,
              rights_and_reproduction,
              metadata_date
            FROM museum_objects
            WHERE provider = ?
            ORDER BY object_id
            """,
            (MET_PROVIDER,),
        ).fetchall()

    return [
        MetMuseumObject(
            object_id=row[0],
            title=row[1],
            object_name=row[2],
            object_url=row[3],
            raw_record_path=Path(row[4]),
            rights_and_reproduction=row[5],
            metadata_date=row[6],
        )
        for row in rows
    ]


def get_met_matches(*, database_path: Path, run_id: int) -> list[MetMatch]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT object_id, search_term, verified, matched_fields_json
            FROM object_matches
            WHERE provider = ? AND run_id = ?
            ORDER BY object_id, search_term
            """,
            (MET_PROVIDER, run_id),
        ).fetchall()

    return [
        MetMatch(
            object_id=row[0],
            search_term=row[1],
            verified=bool(row[2]),
            matched_fields=json.loads(row[3]),
        )
        for row in rows
    ]


def get_met_descriptors(*, database_path: Path, object_id: int) -> list[MetDescriptor]:
    with sqlite3.connect(database_path) as connection:
        ensure_met_ingest_schema(connection)
        rows = connection.execute(
            """
            SELECT descriptor_type, value, source_field
            FROM descriptors
            WHERE provider = ? AND object_id = ?
            ORDER BY descriptor_type, value, source_field
            """,
            (MET_PROVIDER, object_id),
        ).fetchall()

    return [
        MetDescriptor(
            object_id=object_id,
            descriptor_type=row[0],
            value=row[1],
            source_field=row[2],
        )
        for row in rows
    ]


def get_run_candidates_for_ingest(
    *,
    connection: sqlite3.Connection,
    run_id: int,
) -> list[dict[str, object]]:
    rows = connection.execute(
        """
        SELECT object_id, source_term
        FROM run_candidates
        WHERE run_id = ?
        ORDER BY run_position
        """,
        (run_id,),
    ).fetchall()

    return [{"object_id": row[0], "source_term": row[1]} for row in rows]


def write_met_raw_record(*, data_root: Path, record: dict[str, object]) -> Path:
    object_id = int(record["objectID"])
    raw_record_path = met_raw_object_path(data_root=data_root, object_id=object_id)
    raw_record_path.parent.mkdir(parents=True, exist_ok=True)
    raw_record_path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")
    return raw_record_path


def upsert_met_museum_object(
    *,
    connection: sqlite3.Connection,
    record: dict[str, object],
    raw_record_path: Path,
) -> None:
    object_id = int(record["objectID"])
    connection.execute(
        """
        INSERT INTO museum_objects (
          provider,
          object_id,
          title,
          object_name,
          artist_display_name,
          object_url,
          is_public_domain,
          rights_and_reproduction,
          metadata_date,
          raw_record_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, object_id) DO UPDATE SET
          title = excluded.title,
          object_name = excluded.object_name,
          artist_display_name = excluded.artist_display_name,
          object_url = excluded.object_url,
          is_public_domain = excluded.is_public_domain,
          rights_and_reproduction = excluded.rights_and_reproduction,
          metadata_date = excluded.metadata_date,
          raw_record_path = excluded.raw_record_path
        """,
        (
            MET_PROVIDER,
            object_id,
            string_value(record.get("title")),
            string_value(record.get("objectName")),
            string_value(record.get("artistDisplayName")),
            string_value(record.get("objectURL")),
            1,
            string_value(record.get("rightsAndReproduction")),
            string_value(record.get("metadataDate")),
            str(raw_record_path),
        ),
    )


def record_met_match(
    *,
    connection: sqlite3.Connection,
    run_id: int,
    object_id: int,
    search_term: str,
    matched_fields: list[str],
) -> None:
    connection.execute(
        """
        INSERT OR REPLACE INTO object_matches (
          run_id,
          provider,
          object_id,
          search_term,
          verified,
          matched_fields_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            MET_PROVIDER,
            object_id,
            search_term,
            int(bool(matched_fields)),
            json.dumps(matched_fields),
        ),
    )


def replace_met_descriptors(
    *,
    connection: sqlite3.Connection,
    object_id: int,
    descriptors: list[MetDescriptor],
) -> None:
    connection.execute(
        "DELETE FROM descriptors WHERE provider = ? AND object_id = ?",
        (MET_PROVIDER, object_id),
    )

    for descriptor in descriptors:
        connection.execute(
            """
            INSERT OR IGNORE INTO descriptors (
              provider,
              object_id,
              descriptor_type,
              value,
              normalized_value,
              source_field
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                MET_PROVIDER,
                object_id,
                descriptor.descriptor_type,
                descriptor.value,
                normalize_search_term(descriptor.value),
                descriptor.source_field,
            ),
        )


def matched_verified_fields(
    *,
    record: dict[str, object],
    search_term: str,
) -> list[str]:
    normalized_search_term = normalize_search_term(search_term)
    matched_fields: list[str] = []

    for source_field in MET_VERIFIED_MATCH_FIELDS:
        values = values_from_met_field(record=record, source_field=source_field)
        if any(normalized_search_term in normalize_search_term(value) for value in values):
            matched_fields.append(source_field)

    return sorted(matched_fields)


def extract_met_descriptors(record: dict[str, object]) -> list[MetDescriptor]:
    object_id = int(record["objectID"])
    descriptors: list[MetDescriptor] = []
    seen_descriptors: set[tuple[str, str, str]] = set()

    for source_field, descriptor_type in MET_DESCRIPTOR_FIELD_TYPES.items():
        for value in values_from_met_field(record=record, source_field=source_field):
            normalized_value = normalize_search_term(value)
            key = (descriptor_type, normalized_value, source_field)
            if not normalized_value or key in seen_descriptors:
                continue

            seen_descriptors.add(key)
            descriptors.append(
                MetDescriptor(
                    object_id=object_id,
                    descriptor_type=descriptor_type,
                    value=value,
                    source_field=source_field,
                )
            )

    return sorted(
        descriptors,
        key=lambda descriptor: (
            descriptor.descriptor_type,
            descriptor.value,
            descriptor.source_field,
        ),
    )


def values_from_met_field(*, record: dict[str, object], source_field: str) -> list[str]:
    if source_field == "tags" or source_field == "tags.term":
        tags = record.get("tags")
        if not isinstance(tags, list):
            return []

        values: list[str] = []
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            term = tag.get("term")
            if isinstance(term, str) and term.strip():
                values.append(term.strip())
        return values

    value = record.get(source_field)
    if isinstance(value, str) and value.strip():
        return [value.strip()]

    return []


def string_value(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def ensure_met_ingest_schema(connection: sqlite3.Connection) -> None:
    ensure_collection_run_schema(connection)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS museum_objects (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          object_name TEXT NOT NULL,
          artist_display_name TEXT NOT NULL,
          object_url TEXT NOT NULL,
          is_public_domain INTEGER NOT NULL,
          rights_and_reproduction TEXT NOT NULL,
          metadata_date TEXT NOT NULL,
          raw_record_path TEXT NOT NULL,
          UNIQUE (provider, object_id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS object_matches (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          search_term TEXT NOT NULL,
          verified INTEGER NOT NULL,
          matched_fields_json TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES collection_runs(id),
          UNIQUE (run_id, provider, object_id, search_term)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS descriptors (
          id INTEGER PRIMARY KEY,
          provider TEXT NOT NULL,
          object_id INTEGER NOT NULL,
          descriptor_type TEXT NOT NULL,
          value TEXT NOT NULL,
          normalized_value TEXT NOT NULL,
          source_field TEXT NOT NULL,
          UNIQUE (
            provider,
            object_id,
            descriptor_type,
            normalized_value,
            source_field
          )
        )
        """
    )
