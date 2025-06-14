// Load environment variables from .env file FIRST
require('dotenv').config();

const express = require('express');
const { connectToDatabase, closeDatabaseConnection } = require('./config/database');

// --- Import Routes ---
const tokenRoutes = require('./api/routes/token.routes');
const factRoutes = require('./api/routes/fact.routes');

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware ---
// Note: Firebase is initialized in its own module (./config/firebase.js)
// and imported by services that need it. No need to require it here.
app.use(express.json());

// --- API Routes ---
// Mount the imported routes onto the app
app.use('/api', tokenRoutes); // All token routes will be prefixed with /api
app.use('/api', factRoutes);  // All fact routes will be prefixed with /api

let server;
// --- Start Server Function ---
const startServer = async () => {
  // 1. Connect to the database
  await connectToDatabase();
  
  // 2. Start the Express server
  server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api`);
  });
};

// --- Run the application ---
startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // 1. Stop the server from accepting new connections
  server.close(async () => {
    console.log("HTTP server closed.");

    // 2. Close the database connection
    await closeDatabaseConnection();

    // 3. Exit the process
    console.log("Shutdown complete. Exiting.");
    process.exit(0);
  });

  // Force shutdown if server fails to close gracefully after a timeout
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down.");
    process.exit(1);
  }, 10000); // 10-second timeout
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Optional but recommended: Handle unhandled errors ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
  // Consider shutting down gracefully here as well
  gracefulShutdown('UNHANDLED_REJECTION').catch(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, throwing an error, or other logic here
  gracefulShutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
});