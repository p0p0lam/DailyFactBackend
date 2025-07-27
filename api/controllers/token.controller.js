// api/controllers/token.controller.js
const crypto = require('crypto');
const { getDb } = require('../../config/database');
const { wrapAesKey, generateRandomAesKey } = require('../../services/crypto.service');
const { sendPushNotification } = require('../../services/push.service');

exports.registerPushToken = async (req, res) => {
  const { push_token, user_id, public_key_pem } = req.body;

  if (!push_token || !user_id || !public_key_pem) {
    return res.status(400).json({ error: 'Missing push_token, user_id, or public_key_pem in request body.' });
  }

  try {
    const aesKey = generateRandomAesKey();
    const wrappedKey = wrapAesKey(aesKey, public_key_pem);
    console.log(`Generated new AES key for user_id '${user_id}'.`);

    const db = getDb();
    const now = new Date().toISOString();

        const sql = `
            INSERT INTO pushTokens (user_id, push_token, aes_key, public_key_pem, last_updated)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                push_token = excluded.push_token,
                aes_key = excluded.aes_key,
                public_key_pem = excluded.public_key_pem,
                last_updated = excluded.last_updated;
        `;

        // Wrapping the db run operation in a Promise to use async/await
        await new Promise((resolve, reject) => {
            db.run(sql, [user_id, push_token, aesKey, public_key_pem, now], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve(this);
            });
        });

        const dbMessage = 'Push token saved successfully.';
        console.log(`User '${user_id}': ${dbMessage}`);
     
    res.status(200).json({
      message: dbMessage,
      user_id: user_id,
      wrapped_aes_key: wrappedKey,
    });
  } catch (error) {
    console.error('Error in registerPushToken controller:', error);
    res.status(500).json({
      error: 'An internal server error occurred.',
      details: error.message
    });
  }
};