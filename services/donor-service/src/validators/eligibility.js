const MIN_AGE = 18;
const MAX_AGE = 65;
const DONATION_GAP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are handled as UTC calendar days so the rule does not depend on the server timezone.
function toUtcDay(value) {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addYears(day, years) {
  const d = new Date(day);
  return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate());
}

function formatDay(day) {
  return new Date(day).toISOString().slice(0, 10);
}

// Earliest day the donor may donate again, or null if they are past the maximum age.
function nextEligibleDate(donor, today = new Date()) {
  const dob = toUtcDay(donor.date_of_birth);
  const tooOldFrom = addYears(dob, MAX_AGE + 1);
  const candidates = [toUtcDay(today), addYears(dob, MIN_AGE)];
  if (donor.last_donation_date) {
    candidates.push(toUtcDay(donor.last_donation_date) + DONATION_GAP_DAYS * DAY_MS);
  }
  const next = Math.max(...candidates);
  return next >= tooOldFrom ? null : formatDay(next);
}

// Eligible when aged 18-65 and the last donation was at least 90 days ago (or never).
function isEligible(donor, today = new Date()) {
  return nextEligibleDate(donor, today) === formatDay(toUtcDay(today));
}

module.exports = { isEligible, nextEligibleDate };
