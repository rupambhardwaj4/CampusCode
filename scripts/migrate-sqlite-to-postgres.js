#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const SQLITE_PATH = path.resolve(__dirname, '..', process.env.SQLITE_PATH || 'campuscode.db');

const pg = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'campuscode',
    ssl: String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false
});

const sqlite = new sqlite3.Database(SQLITE_PATH);

function sqliteAll(query, params = []) {
    return new Promise((resolve, reject) => {
        sqlite.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}

function mapType(typeRaw) {
    const type = String(typeRaw || '').toUpperCase();
    if (type.includes('INT')) return 'BIGINT';
    if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'DOUBLE PRECISION';
    if (type.includes('BLOB')) return 'BYTEA';
    if (type.includes('DATE') || type.includes('TIME')) return 'TIMESTAMP';
    return 'TEXT';
}

function quoteIdent(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
}

async function createTableFromSqlite(table) {
    const columns = await sqliteAll(`PRAGMA table_info(${table})`);
    if (!columns.length) return;

    const pkCols = columns.filter((c) => Number(c.pk) > 0).sort((a, b) => a.pk - b.pk);
    const singlePk = pkCols.length === 1 ? pkCols[0] : null;

    const defs = columns.map((c) => {
        const colName = quoteIdent(c.name);
        const isIntegerPkAuto = singlePk && c.name === singlePk.name && /INT/i.test(String(c.type || ''));
        if (isIntegerPkAuto) {
            return `${colName} BIGSERIAL PRIMARY KEY`;
        }
        let def = `${colName} ${mapType(c.type)}`;
        if (Number(c.notnull) === 1) def += ' NOT NULL';
        if (c.dflt_value !== null && c.dflt_value !== undefined) {
            const raw = String(c.dflt_value).trim();
            if (/^current_timestamp$/i.test(raw)) def += ' DEFAULT CURRENT_TIMESTAMP';
            else def += ` DEFAULT ${raw}`;
        }
        return def;
    });

    if (!singlePk && pkCols.length > 0) {
        defs.push(`PRIMARY KEY (${pkCols.map((c) => quoteIdent(c.name)).join(', ')})`);
    }

    const createSql = `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (${defs.join(', ')})`;
    await pg.query(createSql);

    // create account_users view alias for compatibility
    if (table === 'users') {
        await pg.query('DROP VIEW IF EXISTS "account_users"');
        await pg.query('CREATE VIEW "account_users" AS SELECT * FROM "users"');
    }
}

async function copyTableData(table) {
    const rows = await sqliteAll(`SELECT * FROM ${table}`);
    if (!rows.length) return;

    const columns = Object.keys(rows[0]);
    const colSql = columns.map(quoteIdent).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${placeholders})`;

    for (const row of rows) {
        const vals = columns.map((c) => row[c]);
        await pg.query(insertSql, vals);
    }
}

async function resetIdentity(table) {
    const result = await pg.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_default ILIKE 'nextval(%'
    `, [table]);
    for (const col of result.rows) {
        const colName = col.column_name;
        await pg.query(
            `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quoteIdent(colName)}) FROM ${quoteIdent(table)}), 1), true)`,
            [table, colName]
        );
    }
}

async function run() {
    console.log(`Migrating SQLite -> PostgreSQL`);
    console.log(`SQLite: ${SQLITE_PATH}`);
    console.log(`Postgres DB: ${process.env.PGDATABASE || 'campuscode'}`);

    const tables = await sqliteAll(`
        SELECT name
        FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE 'pg_%'
        ORDER BY name
    `);

    for (const t of tables) {
        const table = t.name;
        console.log(`\n[1/3] Drop existing table ${table}`);
        await pg.query(`DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE`);
    }

    for (const t of tables) {
        const table = t.name;
        console.log(`[2/3] Create table ${table}`);
        await createTableFromSqlite(table);
    }

    for (const t of tables) {
        const table = t.name;
        console.log(`[3/3] Copy data ${table}`);
        await copyTableData(table);
        await resetIdentity(table);
    }

    // Ensure compatibility view exists after copy.
    await pg.query('DROP VIEW IF EXISTS "account_users"');
    await pg.query('CREATE VIEW "account_users" AS SELECT * FROM "users"');

    console.log('\n✅ Migration complete.');
    console.log('Set DB_CLIENT=postgres in .env and start app.');
}

run()
    .catch((err) => {
        console.error('❌ Migration failed:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try { sqlite.close(); } catch (_) {}
        try { await pg.end(); } catch (_) {}
    });

