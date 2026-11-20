const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const COMPONENTS = ['WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'PLASMA'];
const URGENCIES = ['ROUTINE', 'URGENT', 'EMERGENCY'];

const requestCreated = {
  type: 'object',
  required: ['requestId', 'hospitalId', 'bloodGroup', 'component', 'quantity', 'urgency'],
  properties: {
    requestId: { type: 'string' },
    hospitalId: { type: 'string' },
    bloodGroup: { type: 'string', enum: BLOOD_GROUPS },
    component: { type: 'string', enum: COMPONENTS },
    quantity: { type: 'integer', minimum: 1, maximum: 10 },
    urgency: { type: 'string', enum: URGENCIES },
  },
};

const inventoryUpdated = {
  type: 'object',
  required: ['institutionId', 'bloodGroup', 'component'],
  properties: {
    institutionId: { type: 'string' },
    bloodGroup: { type: 'string', enum: BLOOD_GROUPS },
    component: { type: 'string', enum: COMPONENTS },
  },
};

const matchCreated = {
  type: 'object',
  required: ['requestId', 'hospitalId', 'matches', 'status', 'matchMs'],
  properties: {
    requestId: { type: 'string' },
    hospitalId: { type: 'string' },
    bloodGroup: { type: 'string', enum: BLOOD_GROUPS },
    component: { type: 'string', enum: COMPONENTS },
    status: { type: 'string' },
    matchMs: { type: 'number' },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['unitId', 'institutionId', 'distanceKm'],
        properties: {
          unitId: { type: 'string' },
          institutionId: { type: 'string' },
          distanceKm: { type: 'number' },
        },
      },
    },
  },
};

const requestEscalated = {
  type: 'object',
  required: ['requestId', 'bloodGroup', 'component', 'urgency'],
  properties: {
    requestId: { type: 'string' },
    bloodGroup: { type: 'string', enum: BLOOD_GROUPS },
    component: { type: 'string', enum: COMPONENTS },
    urgency: { type: 'string', enum: URGENCIES },
    donorGroups: { type: 'array', items: { type: 'string', enum: BLOOD_GROUPS } },
    // Set on the one-time admin alert for requests escalated longer than ESCALATION_ALERT_MIN.
    alert: { type: 'boolean' },
    escalatedMinutes: { type: 'number' },
  },
};

const unitExpiring = {
  type: 'object',
  required: ['unitId', 'institutionId', 'bloodGroup', 'flag'],
  properties: {
    unitId: { type: 'string' },
    institutionId: { type: 'string' },
    bloodGroup: { type: 'string', enum: BLOOD_GROUPS },
    flag: { type: 'string', enum: ['NEAR_EXPIRY', 'EXPIRED'] },
  },
};

module.exports = {
  BLOOD_GROUPS,
  COMPONENTS,
  URGENCIES,
  requestCreated,
  inventoryUpdated,
  matchCreated,
  requestEscalated,
  unitExpiring,
};
