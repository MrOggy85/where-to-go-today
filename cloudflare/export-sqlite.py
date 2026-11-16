#!/usr/bin/env python3
"""Turns a snapshot of the Deno server's SQLite database into INSERT statements for D1.

    export-sqlite.py <snapshot.sqlite3> <out.sql>

Only data: D1's schema comes from migrations/. Each INSERT names its columns, because the
production file grew some columns by ALTER TABLE and their order differs from a fresh
schema. Columns are checked against migrations/0001_initial.sql first, so a column D1
does not have stops the export instead of failing halfway through the import.

Left out on purpose: `sessions` (a new hostname means every device logs in again anyway,
so the cookies would be useless rows), and anything outside the tables below.
"""
import json
import sqlite3
import sys
from pathlib import Path

# Parents before children, so every foreign key already has its row.
TABLES = ['households', 'profiles', 'categories', 'places', 'place_categories', 'visits', 'photos']

MIGRATION = Path(__file__).resolve().parent / 'migrations' / '0001_initial.sql'


def literal(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return '1' if v else '0'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "X'" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def columns(db, table):
    return [r[1] for r in db.execute(f'PRAGMA table_info({table})')]


def main(src, out):
    source = sqlite3.connect(f'file:{src}?mode=ro', uri=True)
    target = sqlite3.connect(':memory:')
    target.executescript(MIGRATION.read_text())

    counts = {}
    with open(out, 'w') as f:
        for table in TABLES:
            have = columns(source, table)
            want = set(columns(target, table))
            extra = [c for c in have if c not in want]
            if extra:
                sys.exit(f'{table}: columns {extra} are not in D1\'s schema; add a migration first')
            cols = ', '.join(have)
            n = 0
            for row in source.execute(f'SELECT {cols} FROM {table} ORDER BY rowid'):
                f.write(f'INSERT INTO {table} ({cols}) VALUES ({", ".join(literal(v) for v in row)});\n')
                n += 1
            counts[table] = n

    print(json.dumps(counts))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
