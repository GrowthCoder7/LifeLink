const express = require('express');
const controller = require('../controllers/inventoryController');

const router = express.Router();

router.get('/', controller.list);
router.get('/expiring', controller.expiring);
router.post('/', controller.create);
router.patch('/:id', controller.patch);
router.post('/:id/allocate', controller.allocate);

module.exports = router;
