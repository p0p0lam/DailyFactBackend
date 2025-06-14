// api/controllers/fact.controller.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getDb } = require('../../config/database');
const { decryptData, generateRandomAesKey } = require('../../services/crypto.service');
const { sendPushNotification } = require('../../services/push.service');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Construct paths relative to the current file
const systemPromptPath = path.join(__dirname, '../../prompts/system-prompt.md');
const userPromptPath = path.join(__dirname, '../../prompts/user-prompt.md');

exports.getRandomFact = async (req, res) => {
    const language = (req.headers['accept-language'] || "en").split(',')[0].split(';')[0];
    //extract authorization header
    const authHeader = req.headers.authorization || '';
    //extract X-User-Id header
    const userId = req.headers['x-user-id'] || '';
    // if authHeader is empty or userId is empty, log a warning and return 401 response
    if (!authHeader || !userId) {
        console.warn('Warning: Missing authorization header or user ID in request.');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const db = getDb();
        const pushTokensCollection = db.collection('pushTokens');
        const userDoc = await pushTokensCollection.findOne({ user_id: userId });

        // 3. Handle the case where the user is not found
        if (!userDoc) {
            console.warn(`User not found in DB for user_id: ${userId}`);
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const aesKey = userDoc.aes_key;
        if (!aesKey) {
            console.error(`AES key missing for user_id: ${userId}`);
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Decrypt the AES key using the provided auth header
        const timestamp = decryptData(authHeader, aesKey);
        if (!timestamp) {
            console.error(`Decryption failed for user_id: ${userId}`);
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Check if the timestamp is valid (e.g., not expired)
        const currentTime = Date.now();
        const last_updated = userDoc.last_updated
        if (!last_updated || (currentTime - new Date(last_updated).getTime()) > 24 * 60 * 60 * 1000) {
            console.warn(`User data is outdated for user_id: ${userId}. Regenerating AES key.`);
            // generate a new AES key and update the user document
            const newAesKey = generateRandomAesKey();
            const public_key_pem = userDoc.public_key_pem || '';
            if(!public_key_pem) {
                console.error(`Public key PEM is missing for user_id: ${userId}`);
                return res.status(401).json({ error: 'Unauthorized' });
            }
            
            const wrappedKey = wrapAesKey(newAesKey, public_key_pem);
            //update the user document with the new AES key
            console.log(`Updating user data for user_id: ${userId} with new AES key.`);
            const updateResult = await pushTokensCollection.updateOne(
                { user_id: userId },
                {
                    $set: {
                        aes_key: newAesKey,
                        last_updated: new Date(),
                    }
                }
            );
            if (updateResult.modifiedCount === 0) {
                console.error(`Failed to update user data for user_id: ${userId}`);
            }
            sendPushNotification(userDoc.push_token, {secret_key: wrappedKey});
        }
    } catch (error) {
        console.error('Error retrieving user data:', error);
        return res.status(500).json({ error: 'Server configuration error' });
    }
    console.log(`Request for fact in language: ${language}`);

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        let systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
        let userPrompt = fs.readFileSync(userPromptPath, 'utf8').replace('%%LANGUAGE%%', language);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.SITE_URL || "http://localhost:8080",
                "X-Title": "NodeJS Simple Fact API"
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-chat:free",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('OpenRouter API Error:', response.status, errorBody);
            return res.status(response.status).json({ error: 'Error from OpenRouter API', details: errorBody });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Internal server error in getRandomFact:', error);
        res.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
};