import test from 'node:test';
import assert from 'node:assert/strict';
import { BLANK_LEASE, leaseStatus, leaseProblem, leaseTerm, normalizeLease, leaseIsBlank } from '../src/market/lease.ts';

const lease = (over) => ({ ...BLANK_LEASE, ...over });

test('a tenancy with nothing recorded has no lease on file', () => {
  assert.equal(leaseStatus(BLANK_LEASE, '2026-11-23'), 'No Lease on File');
  assert.equal(leaseStatus(lease({ remarks: 'Waiting for the signed copy' }), '2026-11-23'), 'No Lease on File');
  assert.equal(leaseIsBlank(BLANK_LEASE), true);
});

test('a lease is active, then expiring within 30 days, then expired the day after it ends', () => {
  const l = lease({ contractNo: '2026-014', startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.equal(leaseStatus(l, '2026-11-23'), 'Active');
  assert.equal(leaseStatus(l, '2026-12-01'), 'Expiring');
  assert.equal(leaseStatus(l, '2026-12-31'), 'Expiring');
  assert.equal(leaseStatus(l, '2027-01-01'), 'Expired');
  assert.equal(leaseStatus(l, '2025-12-31'), 'Not Yet Started');
  // A contract number with no end date is taken as running.
  assert.equal(leaseStatus(lease({ contractNo: 'X-1' }), '2026-11-23'), 'Active');
});

test('the term reads as people say it, and an end before the start is refused', () => {
  assert.equal(leaseTerm(lease({ startDate: '2026-01-01', endDate: '2026-12-31' })), '1 year');
  assert.equal(leaseTerm(lease({ startDate: '2026-01-01', endDate: '2027-06-30' })), '1 year 6 months');
  assert.equal(leaseTerm(lease({ startDate: '2026-03-15', endDate: '2026-09-14' })), '6 months');
  assert.equal(leaseTerm(lease({ startDate: '2026-03-01', endDate: '2026-03-10' })), '10 days');
  assert.match(leaseProblem(lease({ startDate: '2026-05-01', endDate: '2026-04-30' })), /cannot be earlier/);
  assert.equal(leaseProblem(lease({ startDate: '2026-05-01', endDate: '2026-05-01' })), '');
});

test('a lease from an old backup or a bad date is read back blank, never broken', () => {
  assert.deepEqual(normalizeLease(undefined), BLANK_LEASE);
  assert.deepEqual(normalizeLease({ contractNo: ' 12 ', endDate: '31/12/2026', startDate: '2026-01-01' }),
    lease({ contractNo: '12', startDate: '2026-01-01' }));
});
