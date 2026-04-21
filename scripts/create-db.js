#!/usr/bin/env node
require('dotenv').config();

const { Pool } = require('pg');

// Connect to default postgres database first
const adminPool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: 'postgres',
    ssl: String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false
});

async function createDatabase() {
    const dbName = process.env.PGDATABASE || 'campuscode';
    
    try {
        // Check if database exists
        const result = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [dbName]
        );
        
        if (result.rows.length > 0) {
            console.log(`✓ Database "${dbName}" already exists`);
        } else {
            // Create database
            await adminPool.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✓ Database "${dbName}" created successfully`);
        }
        
        await adminPool.end();
        process.exit(0);
    } catch (error) {
        console.error('✗ Error:', error.message);
        await adminPool.end();
        process.exit(1);
    }
}

createDatabase();
