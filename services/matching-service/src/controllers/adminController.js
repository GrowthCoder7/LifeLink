const statsModel = require('../models/statsModel');

function toMap(rows, key) {
  return Object.fromEntries(rows.map((row) => [row[key], row.count])); // eslint-disable-line security/detect-object-injection
}

async function stats(req, res, next) {
  try {
    const [byGroup, byStatus, expiredUnits, avgMatchMs] = await Promise.all([
      statsModel.availableByGroup(),
      statsModel.requestsByStatus(),
      statsModel.expiredUnitCount(),
      statsModel.averageMatchMs(),
    ]);
    const requestsByStatus = toMap(byStatus, 'status');
    const totalRequests = byStatus.reduce((sum, row) => sum + row.count, 0);
    const availableByGroup = toMap(byGroup, 'blood_group');
    res.json({
      availableUnits: byGroup.reduce((sum, row) => sum + row.count, 0),
      availableByGroup,
      requestsByStatus,
      totalRequests,
      fulfilmentRate: totalRequests ? (requestsByStatus.MATCHED || 0) / totalRequests : 0,
      expiredUnits,
      avgMatchMs: avgMatchMs === null ? null : Math.round(avgMatchMs),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { stats };
