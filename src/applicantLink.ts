/** Resolve approval without assigning an occupied stall or duplicating a tenancy. */
export function approvalTarget<A extends { id: string; status: string; stallId?: string }, S extends { id: string; status: string }, T extends { applicantId?: string; stallId: string }>(applicant: A, stalls: S[], tenants: T[]) {
  const tenant = tenants.find(t => t.applicantId === applicant.id);
  const stall = applicant.status === 'Approved' && !tenant
    ? stalls.find(s => s.id === applicant.stallId && s.status === 'Available' && !tenants.some(t => t.stallId === s.id))
    : undefined;
  return { tenant, stall, needsStall: applicant.status === 'Approved' && !tenant && !stall };
}
