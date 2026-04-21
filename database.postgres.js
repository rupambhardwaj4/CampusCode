require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'campuscode',
    ssl: String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false
});

function replaceGroupConcat(sql) {
    let out = String(sql || '');
    let result = '';
    let i = 0;
    
    while (i < out.length) {
        const remaining = out.substring(i);
        const gcMatch = remaining.match(/^([\s\S]*?)GROUP_CONCAT\s*\(/i);
        
        if (!gcMatch) {
            result += remaining;
            break;
        }
        
        result += gcMatch[1] + 'STRING_AGG(';
        i += gcMatch[0].length;
        
        // Find matching closing parenthesis
        let parenDepth = 1;
        let j = i;
        let inString = false;
        let stringChar = '';
        
        while (j < out.length && parenDepth > 0) {
            const char = out[j];
            
            if (inString) {
                if (char === stringChar && out[j-1] !== '\\') {
                    inString = false;
                }
            } else {
                if (char === '"' || char === "'" || char === '`') {
                    inString = true;
                    stringChar = char;
                } else if (char === '(') {
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                }
            }
            
            if (parenDepth > 0) j++;
        }
        
        if (parenDepth === 0) {
            const gcContent = out.substring(i, j);
            const parts = gcContent.match(/^(DISTINCT\s+)?(.*?)(?:,\s*'([^']*)'\s*)?$/i);
            
            if (parts) {
                // Note: DISTINCT is handled separately in application logic, not in STRING_AGG
                const expression = parts[2].trim();
                const separator = parts[3] || ',';
                
                result += `(${expression})::text, '${separator}')`;
            } else {
                result += `(${gcContent})::text, ',')`;
            }
            
            i = j + 1;
        } else {
            result += out.substring(i);
            break;
        }
    }
    
    return result;
}

function rewriteSql(sql) {
    let out = String(sql || '');
    // Keep existing route SQL compatible with Postgres when schema has camelCase column names.
    const camelIdentifiers = [
        'fullName', 'collegeName', 'joiningDate', 'createdAt', 'updatedAt',
        'isVerified', 'is_verified', 'solvedCount', 'createdBy', 'created_by',
        'startDate', 'endDate', 'registrationEndDate', 'rulesAndDescription',
        'live_mode', 'live_user_ids', 'live_at', 'approved_by', 'approved_at',
        'pending_college_name', 'college_request_status'
    ];
    for (const ident of camelIdentifiers) {
        const re = new RegExp(`\\b${ident}\\b`, 'g');
        out = out.replace(re, `"${ident}"`);
    }
    // SQLite aggregate compatibility - handle GROUP_CONCAT with proper parenthesis matching
    out = replaceGroupConcat(out);
    out = out.replace(/strftime\('%Y-%m-%d'\s*,\s*([^)]+)\)/gi, `TO_CHAR($1, 'YYYY-MM-DD')`);
    out = out.replace(/strftime\('%Y-%m'\s*,\s*([^)]+)\)/gi, `TO_CHAR($1, 'YYYY-MM')`);
    out = out.replace(/strftime\('%m'\s*,\s*([^)]+)\)/gi, `TO_CHAR($1, 'MM')`);
    out = out.replace(/strftime\('%W'\s*,\s*([^)]+)\)/gi, `TO_CHAR($1, 'WW')`);
    // Generic SQLite date('now','-N unit') -> Postgres interval
    out = out.replace(/date\('now'\s*,\s*'-(\d+)\s*(day|days|month|months|year|years)'\)/gi, `(CURRENT_DATE - INTERVAL '$1 $2')`);
    out = out.replace(/DATE\('now'\s*,\s*'-(\d+)\s*(day|days|month|months|year|years)'\)/g, `(CURRENT_DATE - INTERVAL '$1 $2')`);
    out = out.replace(/date\('now'\)/gi, `CURRENT_DATE`);
    out = out.replace(/datetime\('now'\)/gi, `CURRENT_TIMESTAMP`);
    // SQLite datetime(...) helper compatibility used in ORDER BY clauses.
    out = out.replace(/datetime\(([^)]+)\)/gi, `($1)`);
    return out;
}

function convertSql(sql, params = []) {
    let out = rewriteSql(sql);
    if (!params || !params.length) return out;
    let i = 0;
    out = out.replace(/\?/g, () => {
        i += 1;
        return `$${i}`;
    });
    return out;
}

async function handleSpecialQuery(sql, params = []) {
    const text = String(sql || '').trim();

    // Compatibility: sqlite master table lookup used by existing routes
    if (/from\s+sqlite_master/i.test(text)) {
        const tableCandidates = ['account_users', 'users', 'student', 'faculty'];
        const rows = [];
        for (const name of tableCandidates) {
            const exists = await pool.query(
                `SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=$1
                ) AS exists`,
                [name]
            );
            if (exists.rows?.[0]?.exists) rows.push({ name });
        }
        return { rows, rowCount: rows.length };
    }

    // Compatibility: PRAGMA table_info(table)
    const pragmaMatch = text.match(/^PRAGMA\s+table_info\(([^)]+)\)/i);
    if (pragmaMatch) {
        const table = pragmaMatch[1].replace(/['"`]/g, '').trim();
        const cols = await pool.query(
            `SELECT
                column_name AS name,
                ordinal_position AS cid,
                data_type AS type,
                CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                column_default AS dflt_value,
                0 AS pk
             FROM information_schema.columns
             WHERE table_schema='public' AND table_name=$1
             ORDER BY ordinal_position`,
            [table]
        );
        return { rows: cols.rows, rowCount: cols.rowCount };
    }

    return null;
}

async function ensureReady() {
    try {
        await pool.query('SELECT 1');
        const usersTable = await pool.query(`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'users'
            ) AS exists
        `);
        if (!usersTable.rows?.[0]?.exists) {
            console.error('[Postgres] users table not found. Run: node scripts/migrate-sqlite-to-postgres.js');
        }
        console.log('✅ Connected to PostgreSQL database.');
    } catch (err) {
        console.error('❌ PostgreSQL connection error:', err.message);
    }
}

ensureReady();

function run(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    const queryText = convertSql(sql, values);

    handleSpecialQuery(sql, values)
        .then((special) => {
            if (special) {
                const ctx = { lastID: undefined, changes: Number(special.rowCount || 0) };
                if (cb) cb.call(ctx, null);
                return null;
            }
            return pool.query(queryText, values);
        })
        .then((result) => {
            if (!result) return;
            const ctx = {
                lastID: result.rows?.[0]?.id ?? undefined,
                changes: Number(result.rowCount || 0)
            };
            if (cb) cb.call(ctx, null);
        })
        .catch((err) => {
            if (cb) cb.call({ lastID: undefined, changes: 0 }, err);
        });
}

function get(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    const queryText = convertSql(sql, values);
    handleSpecialQuery(sql, values)
        .then((special) => special || pool.query(queryText, values))
        .then((result) => {
            if (cb) cb(null, result.rows?.[0] || undefined);
        })
        .catch((err) => {
            if (cb) cb(err);
        });
}

function all(sql, params, callback) {
    const cb = typeof params === 'function' ? params : callback;
    const values = Array.isArray(params) ? params : [];
    const queryText = convertSql(sql, values);
    handleSpecialQuery(sql, values)
        .then((special) => special || pool.query(queryText, values))
        .then((result) => {
            if (cb) cb(null, result.rows || []);
        })
        .catch((err) => {
            if (cb) cb(err);
        });
}

function serialize(fn) {
    if (typeof fn === 'function') fn();
}

module.exports = {
    run,
    get,
    all,
    serialize,
    pool
};
