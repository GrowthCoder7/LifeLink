const LEVELS = new Map([['debug', 10], ['info', 20], ['warn', 30], ['error', 40]]);

const configured = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = LEVELS.get(configured) || LEVELS.get('info');

function serialize(message, meta) {
  if (meta === undefined) return message;
  return `${message} ${JSON.stringify(meta)}`;
}

function write(level, message, meta) {
  if (LEVELS.get(level) < threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${serialize(message, meta)}`;
  if (level === 'error' || level === 'warn') {
    console.error(line);
    return;
  }
  console.log(line);
}

module.exports = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
