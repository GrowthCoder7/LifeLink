const express = require('express');
const requestController = require('../controllers/requestController');
const adminController = require('../controllers/adminController');

const requests = express.Router();
requests.post('/', requestController.create);
requests.get('/', requestController.list);
requests.get('/:id', requestController.getOne);

const admin = express.Router();
admin.get('/stats', adminController.stats);

module.exports = { requests, admin };
