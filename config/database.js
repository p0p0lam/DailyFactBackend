const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH;

let db;

/**
 * Connects to the SQLite database using the path from environment variables.
 * Exits the process if the connection fails or if SQLITE_DB_PATH is not defined.
 */
function connectToDatabase() {
    if (!SQLITE_DB_PATH) {
        console.error('FATAL ERROR: SQLITE_DB_PATH is not defined in your .env file.');
        process.exit(1);
    }
    const dbPath = path.resolve(__dirname, '..', SQLITE_DB_PATH);
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Failed to connect to SQLite database:", err);
            process.exit(1);
        } else {
            console.log("Successfully connected to SQLite database.");
        }
    });
}

/**
 * Returns the database instance.
 */
const getDb = () => {
    if (!db) {
        throw new Error('Database not initialized! Call connectToDatabase first.');
    }
    return db;
};

/**
 * Closes the connection to the SQLite database.
 */
function closeDatabaseConnection() {
    if (db) {
        db.close((err) => {
            if (err) {
                console.error("Error closing SQLite connection:", err);
            } else {
                console.log("Successfully closed SQLite connection.");
            }
        });
    }
}

module.exports = { connectToDatabase, getDb, closeDatabaseConnection };