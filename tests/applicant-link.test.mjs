import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalTarget } from '../src/applicantLink.ts';

const applicant = { id: 'APP-1', status: 'Approved', stallId: 'VS-1' };
const stall = { id: 'VS-1', status: 'Available' };
test('approval selects the preferred vacant stall', () => {
  assert.equal(approvalTarget(applicant, [stall], []).stall, stall);
});
test('pending applicants do not receive a tenancy', () => {
  assert.deepEqual(approvalTarget({ ...applicant, status: 'Pending Review' }, [stall], []), { tenant: undefined, stall: undefined, needsStall: false });
});
test('repeat approval keeps the existing linked tenant', () => {
  const tenant = { applicantId: applicant.id, stallId: stall.id };
  assert.deepEqual(approvalTarget(applicant, [stall], [tenant]), { tenant, stall: undefined, needsStall: false });
});
test('missing, unavailable and already assigned stalls require a choice', () => {
  for (const [a, stalls, tenants] of [
    [{ ...applicant, stallId: undefined }, [stall], []],
    [applicant, [], []],
    [applicant, [{ ...stall, status: 'Occupied' }], []],
    [applicant, [stall], [{ applicantId: 'APP-2', stallId: stall.id }]],
  ]) {
    const result = approvalTarget(a, stalls, tenants);
    assert.equal(result.stall, undefined);
    assert.equal(result.needsStall, true);
  }
});
