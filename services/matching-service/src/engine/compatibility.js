const { BLOOD_GROUPS } = require('@lifelink/shared/eventSchemas');

// Red-cell ABO/Rh compatibility: recipient -> donor groups it can receive from.
const CAN_RECEIVE_FROM = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': [...BLOOD_GROUPS],
};

function compatibleDonorGroups(recipientGroup) {
  return BLOOD_GROUPS.includes(recipientGroup) ? [...CAN_RECEIVE_FROM[recipientGroup]] : [];
}

function isCompatible(donorGroup, recipientGroup) {
  return compatibleDonorGroups(recipientGroup).includes(donorGroup);
}

// Recipient groups that a unit of donorGroup could serve (used when new stock arrives).
function compatibleRecipientGroups(donorGroup) {
  return BLOOD_GROUPS.filter((recipient) => isCompatible(donorGroup, recipient));
}

module.exports = { isCompatible, compatibleDonorGroups, compatibleRecipientGroups };
