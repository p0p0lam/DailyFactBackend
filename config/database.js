const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
let db;
let client;
/**
 * Connects to the MongoDB database using the URI from environment variables.
 * Exits the process if the connection fails or if MONGODB_URI is not defined.
 */
async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in your .env file.');
    process.exit(1);
  }

  // client = new MongoClient(MONGODB_URI, {
  //   serverApi: {
  //     version: ServerApiVersion.v1,
  //     strict: true,
  //     deprecationErrors: true,
  //   }
  // });
  client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    db = client.db("dailyfact"); // Or your specific DB name
    console.log("Successfully connected to MongoDB.");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

// Function to get the database instance
const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized! Call connectToDatabase first.');
  }
  return db;
};

async function closeDatabaseConnection() {
  if (client) {
    try {
      await client.close();
      console.log("Successfully closed MongoDB connection.");
    } catch (err) {
      console.error("Error closing MongoDB connection:", err);
    }
  }
}

module.exports = { connectToDatabase, getDb, closeDatabaseConnection };
