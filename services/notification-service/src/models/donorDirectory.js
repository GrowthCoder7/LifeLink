// Eligible donors come from donor-service, which owns the donor table and the eligibility rule.
async function eligibleDonorIds(bloodGroups, baseUrl = process.env.DONOR_SERVICE_URL || 'http://localhost:4001') {
  const ids = [];
  for (const group of bloodGroups) {
    const url = `${baseUrl}/api/donors?bloodGroup=${encodeURIComponent(group)}&eligible=true`;
    const res = await fetch(url, { headers: { 'x-user-role': 'ADMIN' } });
    if (!res.ok) {
      // Throwing leaves the event un-acked, so it is retried once donor-service is back.
      throw new Error(`donor-service responded ${res.status}`);
    }
    ids.push(...(await res.json()).map((donor) => donor.id));
  }
  return ids;
}

module.exports = { eligibleDonorIds };
