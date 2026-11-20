const URGENCY_RANK = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };

function urgencyRank(urgency) {
  return URGENCY_RANK[urgency] ?? Object.keys(URGENCY_RANK).length; // eslint-disable-line security/detect-object-injection
}

// EMERGENCY > URGENT > ROUTINE, then oldest first. Returns a new array; input is never mutated.
function rankRequests(requests) {
  return [...requests].sort(
    (a, b) =>
      urgencyRank(a.urgency) - urgencyRank(b.urgency) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

module.exports = { rankRequests };
