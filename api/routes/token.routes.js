const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/token.controller');

// Route for registering a push token
router.post('/pushToken', tokenController.registerPushToken);

module.exports = router;