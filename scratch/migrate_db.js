const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('campuscode.db');

db.serialize(() => {
    // Add hos_verified_by column
    db.run("ALTER TABLE contests ADD COLUMN hos_verified_by INTEGER;", (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) console.log("hos_verified_by already exists");
            else console.error(err);
        } else {
            console.log("Added hos_verified_by column");
        }
    });

    // Add hos_verified_at column
    db.run("ALTER TABLE contests ADD COLUMN hos_verified_at DATETIME;", (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) console.log("hos_verified_at already exists");
            else console.error(err);
        } else {
            console.log("Added hos_verified_at column");
        }
    });
});
db.close();
