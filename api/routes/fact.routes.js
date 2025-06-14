const express = require('express');
const router = express.Router();
const factController = require('../controllers/fact.controller');

// Route for getting a random fact
router.post('/getRandomFact', factController.getRandomFact);

module.exports = router;