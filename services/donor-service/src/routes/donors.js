const express = require('express');
const controller = require('../controllers/donorController');

const router = express.Router();

router.post('/', controller.register);
router.get('/me', controller.me);
router.get('/', controller.list);

module.exports = router;
