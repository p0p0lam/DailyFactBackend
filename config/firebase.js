const admin = require('firebase-admin');

try {
  // initializeApp will automatically use GOOGLE_APPLICATION_CREDENTIALS
  // if they are set in your environment.
  admin.initializeApp();
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
  process.exit(1);
}

module.exports = admin;