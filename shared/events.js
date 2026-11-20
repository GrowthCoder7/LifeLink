const { getRedis } = require('./redis');
const logger = require('./logger');

const DATA_FIELD = 'data';
const COUNT = 100;
const BLOCK_MS = 5000;

async function publish(stream, payload) {
  const redis = getRedis();
  await redis.xadd(stream, '*', DATA_FIELD, JSON.stringify(payload));
  logger.debug('event published', { stream });
}

async function createConsumerGroup(redis, stream, group) {
  try {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
  } catch (err) {
    if (!/BUSYGROUP/i.test(err.message)) {
      throw err;
    }
  }
}

function parseEntries(reply) {
  const entries = [];
  if (!reply) {
    return entries;
  }
  for (const [stream, streamEntries] of reply) {
    for (const [id, fields] of streamEntries) {
      const dataIndex = fields.indexOf(DATA_FIELD);
      if (dataIndex === -1) {
        continue;
      }
      entries.push({ stream, id, payload: JSON.parse(fields[dataIndex + 1]) });
    }
  }
  return entries;
}

async function readPending(redis, stream, group, consumer) {
  const reply = await redis.xreadgroup(
    'GROUP', group, consumer, 'COUNT', COUNT, 'STREAMS', stream, '0'
  );
  return parseEntries(reply);
}

async function readNew(redis, stream, group, consumer) {
  const reply = await redis.xreadgroup(
    'GROUP', group, consumer, 'COUNT', COUNT, 'BLOCK', BLOCK_MS, 'STREAMS', stream, '>'
  );
  return parseEntries(reply);
}

async function handleEntry(redis, entry, group, handler) {
  try {
    await handler(entry.payload);
    await redis.xack(entry.stream, group, entry.id);
  } catch (err) {
    logger.error('event handler failed', {
      stream: entry.stream,
      id: entry.id,
      error: err.message,
    });
  }
}

async function consume({ stream, group, consumer, handler }) {
  // Dedicated connection: a BLOCKing XREADGROUP would otherwise stall every other command.
  const redis = getRedis().duplicate();
  await createConsumerGroup(redis, stream, group);

  let pending = [];
  try {
    pending = await readPending(redis, stream, group, consumer);
  } catch (err) {
    logger.warn('unable to read pending events', { stream, error: err.message });
  }
  for (const entry of pending) {
    await handleEntry(redis, entry, group, handler);
  }

  while (true) {
    let entries = [];
    try {
      entries = await readNew(redis, stream, group, consumer);
    } catch (err) {
      logger.error('stream read failed', { stream, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    for (const entry of entries) {
      await handleEntry(redis, entry, group, handler);
    }
  }
}

module.exports = { publish, consume };
