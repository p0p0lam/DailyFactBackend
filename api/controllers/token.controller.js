// api/controllers/token.controller.js
const crypto = require('crypto');
const { getDb } = require('../../config/database');
const { wrapAesKey } = require('../../services/crypto.service');
const { sendPushNotification } = require('../../services/push.service');

exports.registerPushToken = async (req, res) => {
  const { push_token, user_id, public_key_pem } = req.body;

  if (!push_token || !user_id || !public_key_pem) {
    return res.status(400).json({ error: 'Missing push_token, user_id, or public_key_pem in request body.' });
  }

  try {
    const aesKey = crypto.randomBytes(32).toString('hex');
    const wrappedKey = wrapAesKey(aesKey, public_key_pem);
    console.log(`Generated new AES key for user_id '${user_id}'.`);

    const db = getDb();
    const pushTokensCollection = db.collection('pushTokens');
    
    const query = { user_id: user_id };
    const update = {
      $set: {
        push_token: push_token,
        aes_key: aesKey,
        last_updated: new Date(),
      },
      $setOnInsert: { user_id: user_id }
    };
    const options = { upsert: true };
    const result = await pushTokensCollection.updateOne(query, update, options);

    let dbMessage = result.upsertedCount > 0 
      ? 'Push token saved successfully for new user.' 
      : 'Push token updated successfully.';
    
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