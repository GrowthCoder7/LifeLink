const { getRedis } = require('@lifelink/shared/redis');
const { publish } = require('@lifelink/shared/events');
const logger = require('@lifelink/shared/logger');
const requestModel = require('../models/requestModel');
const { rankRequests } = require('./ranking');
const { compatibleDonorGroups } = require('./compatibility');

const MINUTE_MS = 60 * 1000;
const ALERT_TTL_SECONDS = 7 * 24 * 60 * 60;

function escalationEvent(request, extra = {}) {
  return {
    requestId: request.id,
    bloodGroup: request.blood_group,
    component: request.component,
    urgency: request.urgency,
    // Lets notification-service call the right donors without its own copy of the table.
    donorGroups: compatibleDonorGroups(request.blood_group),
    ...extra,
  };
}

// An EMERGENCY request still PENDING/PARTIAL after matching is escalated network-wide.
async function escalateIfNeeded(request) {
  if (request.urgency !== 'EMERGENCY' || !['PENDING', 'PARTIAL'].includes(request.status)) {
    return false;
  }
  const escalated = await requestModel.markEscalated(request.id);
  if (escalated) {
    await publish('request.escalated', escalationEvent(request));
    logger.info('request escalated', { requestId: request.id });
  }
  return escalated;
}

// Re-run matching for open requests (optionally only those a stock change could help), most urgent first.
async function retryOpenRequests(matchRequest, filter = {}) {
  const ranked = rankRequests(await requestModel.listOpenRequests(filter));
  for (const request of ranked) {
    await matchRequest(request.id);
  }
  return ranked.length;
}

// Requests escalated for longer than alertMinutes alert the admins exactly once. The Redis
// SET NX marker makes "once" hold across restarts and across scaled matching instances.
async function alertStaleEscalations(alertMinutes, now = Date.now()) {
  const stale = await requestModel.listEscalatedBefore(new Date(now - alertMinutes * MINUTE_MS));
  let alerted = 0;
  for (const request of stale) {
    const first = await getRedis().set(`escalation-alert:${request.id}`, '1', 'EX', ALERT_TTL_SECONDS, 'NX');
    if (first) {
      await publish('request.escalated', escalationEvent(request, { alert: true, escalatedMinutes: alertMinutes }));
      alerted += 1;
    }
  }
  return alerted;
}

function start(matchRequest, env = process.env) {
  const intervalMs = Number(env.ESCALATION_RETRY_MS) || 30000;
  const alertMinutes = Number(env.ESCALATION_ALERT_MIN) || 10;
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await retryOpenRequests(matchRequest);
      await alertStaleEscalations(alertMinutes);
    } catch (err) {
      logger.error('escalation tick failed', { error: err.message });
    } finally {
      running = false;
    }
  };
  logger.info('escalation timer started', { intervalMs, alertMinutes });
  return setInterval(tick, intervalMs);
}

module.exports = { escalateIfNeeded, retryOpenRequests, alertStaleEscalations, start };
