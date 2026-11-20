const Redis = require('ioredis');

let client = null;
let injected = null;

function createClient(url = process.env.REDIS_URL) {
  return new Redis(url, { maxRetriesPerRequest: null });
}

function getRedis() {
  if (injected) {
    return injected;
  }
  if (!client) {
    client = createClient();
  }
  return client;
}

function setRedis(mock) {
  injected = mock;
}

function resetRedis() {
  injected = null;
}

module.exports = { createClient, getRedis, setRedis, resetRedis };
