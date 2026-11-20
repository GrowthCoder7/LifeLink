const notificationModel = require('../models/notificationModel');
const donorDirectory = require('../models/donorDirectory');
const { getSmsProvider } = require('../providers/smsProvider');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const hospitalStaff = (institutionId) => ({ role: 'HOSPITAL_STAFF', institutionId });
const bankStaff = (institutionId) => ({ role: 'BLOODBANK_STAFF', institutionId });

async function onRequestCreated(event) {
  await notificationModel.insertNotifications([{
    ...hospitalStaff(event.hospitalId),
    title: `${event.urgency} request raised`,
    body: `${event.quantity} x ${event.bloodGroup} ${event.component} is being matched.`,
  }]);
}

function countByInstitution(matches) {
  const counts = new Map();
  for (const match of matches) {
    counts.set(match.institutionId, (counts.get(match.institutionId) || 0) + 1);
  }
  return counts;
}

async function onMatchCreated(event) {
  const units = `${plural(event.matches.length, 'unit')} of ${event.bloodGroup}`;
  const hospitalBody = event.status === 'MATCHED'
    ? `${units} allocated, matched in ${seconds(event.matchMs)}.`
    : `${units} allocated so far; request is ${event.status}.`;
  const hospitalName = await notificationModel.institutionName(event.hospitalId);
  const title = event.status === 'MATCHED' ? 'Request matched' : 'Request partially matched';
  const rows = [{ ...hospitalStaff(event.hospitalId), title, body: hospitalBody }];
  for (const [institutionId, count] of countByInstitution(event.matches)) {
    rows.push({
      ...bankStaff(institutionId),
      title: 'Units allocated',
      body: `${plural(count, 'unit')} of ${event.bloodGroup} allocated to ${hospitalName}.`,
    });
  }
  await notificationModel.insertNotifications(rows);
}

async function donorCalls(event) {
  const donorIds = await donorDirectory.eligibleDonorIds(event.donorGroups || [event.bloodGroup]);
  const userIds = await notificationModel.userIdsForDonors(donorIds);
  const body = `Urgent: ${event.bloodGroup} blood is needed. If you can, please donate at your nearest blood bank today.`;
  return userIds.flatMap((userId) => [
    { userId, title: 'Urgent donation call', body },
    { userId, channel: 'SMS', title: 'Urgent donation call', body },
  ]);
}

async function onRequestEscalated(event) {
  if (event.alert) {
    await notificationModel.insertNotifications([{
      role: 'ADMIN',
      title: 'Escalation unresolved',
      body: `${event.bloodGroup} ${event.component} request has been escalated for over ${event.escalatedMinutes} min.`,
    }]);
    return;
  }
  const rows = [
    { ...bankStaff(null), title: 'Emergency request escalated', body: `${event.bloodGroup} ${event.component} needed network-wide. Please check your stock.` },
    ...(await donorCalls(event)),
  ];
  await notificationModel.insertNotifications(rows);
  const sms = getSmsProvider();
  rows.filter((row) => row.channel === 'SMS').forEach((row) => sms.send({ to: `user:${row.userId}`, body: row.body }));
}

async function onUnitExpiring(event) {
  const expired = event.flag === 'EXPIRED';
  await notificationModel.insertNotifications([{
    ...bankStaff(event.institutionId),
    title: expired ? 'Unit expired' : 'Unit near expiry',
    body: `${event.bloodGroup} unit ${event.unitId.slice(0, 8)} ${expired ? 'has expired and was removed from stock' : 'expires within 3 days'}.`,
  }]);
}

module.exports = { onRequestCreated, onMatchCreated, onRequestEscalated, onUnitExpiring };
