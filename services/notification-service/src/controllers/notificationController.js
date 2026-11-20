const Joi = require('joi');
const { AppError } = require('@lifelink/shared/errors');
const notificationModel = require('../models/notificationModel');

const idSchema = Joi.string().uuid().required();

function caller(req) {
  const identity = {
    userId: req.get('x-user-id'),
    role: req.get('x-user-role'),
    institutionId: req.get('x-institution-id'),
  };
  if (!identity.userId || !identity.role) {
    throw new AppError(401, 'Unauthorized');
  }
  return identity;
}

async function list(req, res, next) {
  try {
    res.json(await notificationModel.listForCaller(caller(req)));
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const identity = caller(req);
    const { error, value: id } = idSchema.validate(req.params.id);
    if (error) {
      throw new AppError(400, 'Invalid notification id', 'id');
    }
    const updated = await notificationModel.markRead(id, identity);
    if (!updated) {
      throw new AppError(404, 'Notification not found');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, markRead };
