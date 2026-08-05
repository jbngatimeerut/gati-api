export const LEADERSHIP = [
  'CONVENER', 'CO_CONVENER', 'GROUP_HEAD', 'TREASURER',
  'GROUP_LEAD', 'GROUP_SECRETARY', 'TECHNOLOGY_COORDINATOR',
];

// Narrower than LEADERSHIP — only these three roles can create/edit premium categories,
// assign members to them, or configure per-category feature permissions.
export const PREMIUM_CATEGORY_MANAGERS = ['CONVENER', 'CO_CONVENER', 'TECHNOLOGY_COORDINATOR'];
