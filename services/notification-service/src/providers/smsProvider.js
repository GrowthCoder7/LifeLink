// SMS adapter. Only the console provider exists: it prints the message instead of sending it.
const providers = {
  console: {
    send({ to, body }) {
      console.log(`[SMS] to=${to} body=${body}`); // eslint-disable-line no-console
    },
  },
};

function getSmsProvider(name = process.env.SMS_PROVIDER || 'console') {
  if (!Object.hasOwn(providers, name)) {
    throw new Error(`Unsupported SMS_PROVIDER "${name}"`);
  }
  return providers[name]; // eslint-disable-line security/detect-object-injection
}

module.exports = { getSmsProvider };
