import re
import sqlite3


def ensure_table_with_text_object_id(
    *,
    connection: sqlite3.Connection,
    table_name: str,
    create_table_sql: str,
) -> None:
    connection.execute(create_table_sql)
    ensure_object_id_text_column(
        connection=connection,
        table_name=table_name,
    )


def ensure_object_id_text_column(
    *,
    connection: sqlite3.Connection,
    table_name: str,
) -> None:
    table_info = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    object_id_column = next(
        (row for row in table_info if row[1] == "object_id"),
        None,
    )
    if object_id_column is None or object_id_column[2].upper() == "TEXT":
        return

    temporary_table_name = f"{table_name}__object_id_text"
    create_sql_row = connection.execute(
        """
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        """,
        (table_name,),
    ).fetchone()
    if create_sql_row is None or not isinstance(create_sql_row[0], str):
        raise ValueError(f"Could not read schema for {table_name}.")

    migrated_create_sql = re.sub(
        r"\bobject_id\s+INTEGER\b",
        "object_id TEXT",
        create_sql_row[0],
        count=1,
        flags=re.IGNORECASE,
    )
    if migrated_create_sql == create_sql_row[0]:
        raise ValueError(f"Could not migrate object_id column for {table_name}.")

    temporary_create_sql = re.sub(
        rf"^CREATE TABLE\s+\"?{re.escape(table_name)}\"?",
        f"CREATE TABLE {temporary_table_name}",
        migrated_create_sql,
        count=1,
        flags=re.IGNORECASE,
    )
    if temporary_create_sql == migrated_create_sql:
        raise ValueError(f"Could not build temporary migration table for {table_name}.")

    columns = [row[1] for row in table_info]
    quoted_columns = ", ".join(columns)
    select_columns = ", ".join(
        "CAST(object_id AS TEXT)" if column == "object_id" else column
        for column in columns
    )

    connection.execute(f"DROP TABLE IF EXISTS {temporary_table_name}")
    connection.execute(temporary_create_sql)
    connection.execute(
        f"""
        INSERT INTO {temporary_table_name} ({quoted_columns})
        SELECT {select_columns}
        FROM {table_name}
        """
    )
    connection.execute(f"DROP TABLE {table_name}")
    connection.execute(
        f"ALTER TABLE {temporary_table_name} RENAME TO {table_name}"
    )
