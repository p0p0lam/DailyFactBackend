// server.js (updated with dotenv)

// Load environment variables from .env file
// This should be at the VERY TOP of your file
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
// --- NEW --- Import MongoClient from the 'mongodb' package
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 8080;

// This line now automatically gets the key from your .env file
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
//const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
app.use(express.json());


try {
  admin.initializeApp({

  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
  process.exit(1);
}

// --- NEW --- MongoDB client and database connection variable
let db;

// --- NEW --- Function to connect to the database
async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in your .env file.');
    process.exit(1); // Exit the application if the DB connection string is missing
  }

  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    // Use a specific database name. Change 'myFactAppDb' if you used a different name in your connection string.
    db = client.db("dailyfact"); 
    console.log("Successfully connected to MongoDB.");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

// --- NEW REUSABLE FUNCTION ---
/**
 * Sends a push notification to a specific device using Firebase Cloud Messaging.
 * @param {string} token - The FCM registration token of the target device.
  * @param {object} [data={}] - An object containing key-value pairs for a data payload.
 * @returns {Promise<{success: boolean, error?: Error}>} - An object indicating the outcome.
 */
async function sendPushNotification(token, data = {}) {
    if (!token) {
        console.error("sendPushNotification Error: The provided token is invalid.");
        return { success: false, error: new Error("Push token is missing or invalid.") };
    }

    const messagePayload = {
        data,
        token
    };

    try {
        console.log(`Sending notification to device...`);
        const response = await admin.messaging().send(messagePayload);
        console.log('Successfully sent FCM message:', response);
        return { success: true };
    } catch (error) {
        // Firebase admin SDK provides detailed error codes
        console.error(`Error sending FCM message to token:`, error);
        return { success: false, error: error };
    }
}

/**
 * Wrap (encrypt) an AES key using an RSA public key (OAEP SHA-256).
 * @param {string} aesKeyHex - The AES key as a hex string.
 * @param {string} publicKeyPem - The RSA public key in PEM format.
 * @returns {string} - The wrapped AES key as a Base64 string.
 */
function wrapAesKey(aesKeyHex, publicKeyPem) {
    const aesKeyBuffer = Buffer.from(aesKeyHex, 'hex');
    const wrappedKey = crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256', // Main hash
            mgf1Hash: 'sha1'    // MGF1 hash MUST BE sha1 for compatibility
        },
        aesKeyBuffer
    );
    return wrappedKey.toString('base64');
}

app.post('/pushToken', async(req, res) => {
  console.log('Received request for /pushToken');
  // 1. Extract push_token and user_id from the request body
  const { push_token, user_id, public_key_pem } = req.body;

  // 2. Validate the incoming data
  if (!push_token || !user_id || !public_key_pem) {
    console.error('Validation Error: Missing required fields in request body.');
    return res.status(400).json({ error: 'Invalid Request".' });
  }

  try {
    const aesKey = crypto.randomBytes(32).toString('hex');
    const wrappedKey = wrapAesKey(aesKey, public_key_pem);
    console.log(`Generated new AES key for user_id '${user_id}'.`);
    // 3. Access the 'pushTokens' collection
    const pushTokensCollection = db.collection('pushTokens');

    // 4. Define the query to find the user by their unique user_id
    const query = { user_id: user_id };

    // 5. Define the update operation using MongoDB's $set operator.
    // This will update the push_token and set the last_updated timestamp.
    const update = {
      $set: {
        push_token: push_token,
        aes_key: aesKey, // Store the AES key for encryption
        last_updated: new Date(), // Store the current time
      },
      // $setOnInsert ensures that the user_id is only set when the document is first created.
      $setOnInsert: {
        user_id: user_id,
      }
    };
    
    // 6. Use { upsert: true } to create a new document if no document matches the query.
    // This is ideal for handling both new and existing users in one operation.
    const options = { upsert: true };

    // 7. Execute the database operation
    const result = await pushTokensCollection.updateOne(query, update, options);
    
     let dbMessage;
    if (result.upsertedCount > 0) {
      dbMessage = 'Push token saved successfully for new user.';
      console.log(`New token and key for user_id '${user_id}' were inserted.`);
    } else {
      dbMessage = 'Push token updated successfully.';
      console.log(`Token and key for user_id '${user_id}' was updated.`);
    }
    
    // --- NEW: Use the extracted function to send the notification ---
    /* const pushResult = await sendPushNotification(
        push_token,
        { secret_key: aesKey } // Pass the key in the data payload
    );

    let pushStatusMessage;
    if (pushResult.success) {
        pushStatusMessage = 'Setup notification sent successfully.';
    } else {
        // The error is already logged by the sendPushNotification function.
        // We just set a user-friendly status message here.
        pushStatusMessage = 'Warning: Could not send setup notification (token may be invalid).';
    } */

    // Send a consolidated success response back to the client
    res.status(200).json({
      message: `${dbMessage}`,
      user_id: user_id,
      wrapped_aes_key: wrappedKey // Return the wrapped AES key
    });

  } catch (error) {
    // Handle any errors that occur during the database operation
    console.error('Error during database operation in /pushToken:', error);
    res.status(500).json({
      error: 'An internal server error occurred while saving the push token.',
      details: error.message
    });
  }

});
app.post('/getRandomFact', async (req, res) => {
  console.log('Received request for /getRandomFact');
  const languageHeader = req.headers['accept-language'] || "en;q=1";
  const language = languageHeader.split(',')[0].split(';')[0];
  console.log('Extracted language:', language);
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY is not defined in the .env file.');
    return res.status(500).json({
      error: 'Server configuration is incomplete: OpenRouter API key is missing.'
    });
  }

  try {
    let systemPrompt = fs.readFileSync('prompts/system-prompt.md', 'utf8');
    let userPrompt = fs.readFileSync('prompts/user-prompt.md', 'utf8');
    userPrompt = userPrompt.replace('%%LANGUAGE%%', language);
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8080",
        "X-Title": "NodeJS Simple Fact API"
      },
      body: JSON.stringify({
        "model": "deepseek/deepseek-chat:free",
        "messages": [
          {
            "role": "system",
            "content": systemPrompt
          },
          {
            "role": "user",
            "content": userPrompt
          }
        ]
      }),
    });

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text();
      console.error('Error from OpenRouter API:', openRouterResponse.status, errorBody);
      return res.status(openRouterResponse.status).json({
        error: 'Error when requesting from OpenRouter API',
        details: errorBody
      });
    }

    const body = await openRouterResponse.json();
    console.log('Successfully received response from OpenRouter. Sending to client.');
    res.status(200).json(body);

  } catch (error) {
    console.error('An internal server error occurred:', error);
    res.status(500).json({
      error: 'An internal server error occurred',
      details: error.message
    });
  }
});

// --- MODIFIED --- Start the server only after connecting to the database
connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
    console.log('To get a fact, send a POST request to http://localhost:8080/getRandomFact');
    console.log('To save a push token, send a POST request to http://localhost:8080/pushToken');
  });
}).catch(console.error);