export const STAFF_EMAIL_DOMAIN = 'spotlyn.local';

export const STAFF_DESIGNATIONS = [
  { title: 'Lab Technician', department: 'IT / Computer Lab' },
  { title: 'Network Technician', department: 'IT / Network' },
  { title: 'Electrician', department: 'Electrical / Maintenance' },
  { title: 'Maintenance Technician', department: 'Infrastructure' },
  { title: 'Plumber', department: 'Infrastructure' },
  { title: 'Security Officer', department: 'Administration' },
  { title: 'Administrative Assistant', department: 'Administration' },
];

export function staffEmailPrefix(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function staffEmailCandidate(title, name, attempt = 0) {
  const designationPrefix = staffEmailPrefix(title);
  if (attempt === 0) return `${designationPrefix}@${STAFF_EMAIL_DOMAIN}`;

  const namePrefix = staffEmailPrefix(name);
  if (!namePrefix) return `${designationPrefix}-${attempt + 1}@${STAFF_EMAIL_DOMAIN}`;

  const namedPrefix = `${designationPrefix}-${namePrefix}`;
  return `${namedPrefix}${attempt === 1 ? '' : `-${attempt}`}@${STAFF_EMAIL_DOMAIN}`;
}
