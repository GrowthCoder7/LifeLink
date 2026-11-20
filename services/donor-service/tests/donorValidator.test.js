const { validateDonor } = require('../src/validators/donorValidator');
const { isEligible, nextEligibleDate } = require('../src/validators/eligibility');

const validDonor = {
  full_name: 'Priya Sharma',
  email: 'Priya@Example.com',
  password: 'Demo@1234',
  phone: '+91-9845011101',
  blood_group: 'O-',
  date_of_birth: '1996-04-12',
};

describe('validateDonor', () => {
  test('TC-01: blood_group "C+" returns an error with field blood_group', () => {
    const result = validateDonor({ ...validDonor, blood_group: 'C+' });
    expect(result.error.field).toBe('blood_group');
    expect(result.value).toBeUndefined();
  });

  test('a valid donor passes and the email is normalised', () => {
    const { value, error } = validateDonor(validDonor);
    expect(error).toBeUndefined();
    expect(value.email).toBe('priya@example.com');
    expect(value.organ_pledge).toBe(false);
  });

  test('a short password is rejected on the password field', () => {
    expect(validateDonor({ ...validDonor, password: 'short' }).error.field).toBe('password');
  });
});

describe('isEligible', () => {
  const today = new Date('2026-06-01T10:00:00Z');

  test('an adult who never donated is eligible today', () => {
    const donor = { date_of_birth: '1990-01-01', last_donation_date: null };
    expect(isEligible(donor, today)).toBe(true);
    expect(nextEligibleDate(donor, today)).toBe('2026-06-01');
  });

  test('a donation 30 days ago makes the donor ineligible until day 90', () => {
    const donor = { date_of_birth: '1990-01-01', last_donation_date: '2026-05-02' };
    expect(isEligible(donor, today)).toBe(false);
    expect(nextEligibleDate(donor, today)).toBe('2026-07-31');
  });

  test('a donation exactly 90 days ago is eligible', () => {
    expect(isEligible({ date_of_birth: '1990-01-01', last_donation_date: '2026-03-03' }, today)).toBe(true);
  });

  test('a 17-year-old becomes eligible on their 18th birthday', () => {
    const donor = { date_of_birth: '2008-09-15', last_donation_date: null };
    expect(isEligible(donor, today)).toBe(false);
    expect(nextEligibleDate(donor, today)).toBe('2026-09-15');
  });

  test('a 66-year-old is never eligible again', () => {
    const donor = { date_of_birth: '1960-01-01', last_donation_date: null };
    expect(isEligible(donor, today)).toBe(false);
    expect(nextEligibleDate(donor, today)).toBeNull();
  });
});
