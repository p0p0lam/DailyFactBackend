const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getDb } = require('../../config/database');
const { decryptData, generateRandomAesKey, wrapAesKey } = require('../../services/crypto.service');
const { sendPushNotification } = require('../../services/push.service');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Construct paths relative to the current file
const systemPromptPath = path.join(__dirname, '../../prompts/system-prompt.md');
const userPromptPath = path.join(__dirname, '../../prompts/user-prompt.md');

exports.getRandomFact = async (req, res) => {
    const language = (req.headers['accept-language'] || "en").split(',')[0].split(';')[0];
    // extract authorization header
    const authHeader = req.headers.authorization || '';
    // extract X-User-Id header
    const userId = req.headers['x-user-id'] || '';
    // if authHeader is empty or userId is empty, log a warning and return 401 response
    if (!authHeader || !userId) {
        console.warn('Warning: Missing authorization header or user ID in request.');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const db = getDb();
        // Promisify the SELECT query
        const userDoc = await new Promise((resolve, reject) => {
            const sql = `SELECT * FROM pushTokens WHERE user_id = ?`;
            db.get(sql, [userId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        
        // Handle the case where the user is not found
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
        const lastUpdated = userDoc.last_updated;
        if (!lastUpdated || (currentTime - new Date(lastUpdated).getTime()) > 24 * 60 * 60 * 1000) {
            console.warn(`User data is outdated for user_id: ${userId}. Regenerating AES key.`);
            // generate a new AES key and update the user row
            const newAesKey = generateRandomAesKey();
            const public_key_pem = userDoc.public_key_pem || '';
            if (!public_key_pem) {
                console.error(`Public key PEM is missing for user_id: ${userId}`);
                return res.status(401).json({ error: 'Unauthorized' });
            }
            
            const wrappedKey = wrapAesKey(newAesKey, public_key_pem);
            console.log(`Updating user data for user_id: ${userId} with new AES key.`);
            
            // Promisify the update operation
            const updateResult = await new Promise((resolve, reject) => {
                const updateSql = `UPDATE pushTokens SET aes_key = ?, last_updated = ? WHERE user_id = ?`;
                const newTimestamp = new Date().toISOString();
                db.run(updateSql, [newAesKey, newTimestamp, userId], function(err) {
                    if (err) return reject(err);
                    resolve(this);
                });
            });
            if (updateResult.changes === 0) {
                console.error(`Failed to update user data for user_id: ${userId}`);
            }
            sendPushNotification(userDoc.push_token, { secret_key: wrappedKey });
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
                //model: "deepseek/deepseek-r1:free",
                model: "deepseek/deepseek-chat-v3-0324:free",
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