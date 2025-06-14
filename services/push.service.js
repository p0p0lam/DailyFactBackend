const admin = require('../config/firebase'); // Import the initialized admin instance

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

    const messagePayload = { data, token };

    try {
        console.log(`Sending notification to device...`);
        const response = await admin.messaging().send(messagePayload);
        console.log('Successfully sent FCM message:', response);
        return { success: true };
    } catch (error) {
        console.error(`Error sending FCM message to token:`, error);
        return { success: false, error: error };
    }
}

module.exports = { sendPushNotification };
