#!/usr/bin/env node
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'campuscode',
    ssl: String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false
});

async function cleanupEmptyStrings() {
    console.log('🔄 Cleaning up empty string defaults for PostgreSQL compatibility...\n');

    const updates = [
        // Users table - convert empty strings to NULL
        { table: 'users', columns: ['department', 'branch', 'program', 'year', 'section', 'post', 'gender', 'mobile', 'joiningDate', 'course', 'github_link', 'location', 'collegeName', 'pending_college_name'] },
        
        // Student table
        { table: 'student', columns: ['department', 'branch', 'year', 'section', 'gender', 'mobile', 'joiningDate', 'collegeName'] },
        
        // Faculty table
        { table: 'faculty', columns: ['department', 'branch', 'year', 'subject', 'collegeName'] },
        
        // Contests table
        { table: 'contests', columns: ['collegeName'] },
        
        // Problems table
        { table: 'problems', columns: ['collegeName'] },
        
        // Submissions table
        { table: 'submissions', columns: ['collegeName'] },
        
        // Other tables
        { table: 'college_request_status', columns: ['collegeName'] },
        { table: 'support_tickets', columns: ['collegeName'] },
    ];

    let totalUpdates = 0;

    for (const { table, columns } of updates) {
        for (const column of columns) {
            try {
                const result = await pool.query(
                    `UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" = '' OR "${column}" = ' '`
                );
                if (result.rowCount > 0) {
                    console.log(`✓ ${table}.${column}: Updated ${result.rowCount} rows`);
                    totalUpdates += result.rowCount;
                }
            } catch (err) {
                // Table or column might not exist, skip silently
            }
        }
    }

    console.log(`\n✅ Cleanup complete! Total rows updated: ${totalUpdates}`);
    console.log('\nYour PostgreSQL database is now compatible with the application.');
}

cleanupEmptyStrings()
    .catch((err) => {
        console.error('❌ Cleanup failed:', err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await pool.end(); } catch (_) {}
    });
