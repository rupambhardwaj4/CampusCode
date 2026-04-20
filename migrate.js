const sqlite3 = require("sqlite3").verbose();
const { Client } = require("pg");

// ✅ Correct SQLite database (your real file)
const sqliteDb = new sqlite3.Database("./campuscode.db");

// ✅ PostgreSQL config (Homebrew user = your Mac username)
const pgClient = new Client({
  user: "prashantyadav",
  host: "localhost",
  database: "postgres",
  password: "",
  port: 5432,
});

async function migrate() {
  try {
    await pgClient.connect();
    console.log("✅ Connected to PostgreSQL");

    sqliteDb.all("SELECT * FROM users", async (err, rows) => {
      if (err) {
        console.error("❌ SQLite Error:", err.message);
        process.exit(1);
      }

      console.log("📦 Rows found:", rows.length);

      for (let row of rows) {
        try {
          await pgClient.query(
            "INSERT INTO users(name, email) VALUES($1, $2)",
            [row.name, row.email]
          );
        } catch (e) {
          console.error("❌ Insert error:", e.message);
        }
      }

      console.log("✅ Migration completed!");
      process.exit();
    });
  } catch (err) {
    console.error("❌ PostgreSQL Connection Error:", err.message);
    process.exit(1);
  }
}

migrate();
