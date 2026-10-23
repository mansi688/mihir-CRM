export const STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'assigned',    label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));
export const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress'];

export const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((s) => [s.value, s.label]));

export const KINDS = [
  { value: 'complaint', label: 'Complaint' },
  { value: 'query',     label: 'Query' },
  { value: 'request',   label: 'Service request' },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((s) => [s.value, s.label]));

export const ROLES = [
  { value: 'staff',   label: 'Staff / technician' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin',   label: 'Admin' },
];
export const ROLE_LABEL = { customer: 'Customer', staff: 'Staff', manager: 'Manager', admin: 'Admin' };

export const SOURCES = [
  { value: 'phone',    label: 'Phone call' },
  { value: 'walk_in',  label: 'Walk-in at office' },
  { value: 'email',    label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export const RELATIONS = [
  { value: 'owner',  label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family', label: 'Family member' },
];

export const MAX_PHOTOS = 5;
