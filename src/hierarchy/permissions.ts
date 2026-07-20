// Capability vocabulary + the DEFAULT role definitions.
// These seed the RoleDef table; after that, super-admin can edit roles at runtime
// (add "Co-Convener", change who a Secretary can onboard, etc.) with no code change.

export type Scope = 'NETWORK' | 'CHAPTER' | 'SELF';

export type Capability =
  | 'network.broadcast' | 'network.settings' | 'roles.manage'
  | 'chapter.view' | 'chapter.referralFee.amend' | 'chapter.broadcast' | 'chapter.invite'
  | 'chapter.attendance.mark' | 'chapter.payment.request'
  | 'member.onboard' | 'member.verify' | 'member.offboard' | 'nfc.manage' | 'audit.view'
  | 'self.inventory' | 'self.orders' | 'self.ads' | 'self.payments' | 'self.messages';

export interface RoleDefInput {
  key: string; label: string; scopeLevel: Scope; rank: number;
  isOfficeBearer: boolean; capabilities: Capability[]; canOnboard: string[];
}

const CHAPTER_OFFICER_CAPS: Capability[] = [
  'chapter.view', 'chapter.referralFee.amend', 'chapter.broadcast', 'chapter.invite',
  'chapter.attendance.mark', 'chapter.payment.request', 'member.onboard', 'member.verify',
  'member.offboard', 'nfc.manage', 'audit.view',
];
const MEMBER_CAPS: Capability[] = ['self.inventory', 'self.orders', 'self.ads', 'self.payments', 'self.messages'];

export const DEFAULT_ROLES: RoleDefInput[] = [
  { key: 'APEX_ADMIN', label: 'Super Admin', scopeLevel: 'NETWORK', rank: 0, isOfficeBearer: true,
    capabilities: ['network.broadcast', 'network.settings', 'roles.manage', ...CHAPTER_OFFICER_CAPS],
    canOnboard: ['CHAPTER_PRESIDENT', 'CHAPTER_CO_PRESIDENT', 'CHAPTER_CHAIRMAN', 'CHAPTER_SECRETARY', 'CHAPTER_TREASURER', 'CONVENER', 'CO_CONVENER'] },

  { key: 'CHAPTER_PRESIDENT', label: 'Chapter President', scopeLevel: 'CHAPTER', rank: 5, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS, canOnboard: ['CHAPTER_CO_PRESIDENT', 'CHAPTER_SECRETARY', 'CHAPTER_TREASURER', 'CONVENER', 'CO_CONVENER', 'MEMBER'] },
  { key: 'CHAPTER_CO_PRESIDENT', label: 'Chapter Co-President', scopeLevel: 'CHAPTER', rank: 8, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS, canOnboard: ['CHAPTER_SECRETARY', 'CHAPTER_TREASURER', 'CONVENER', 'CO_CONVENER', 'MEMBER'] },

  { key: 'CHAPTER_CHAIRMAN', label: 'Chapter Chairman', scopeLevel: 'CHAPTER', rank: 10, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS, canOnboard: ['CHAPTER_SECRETARY', 'CHAPTER_TREASURER', 'CONVENER', 'CO_CONVENER', 'MEMBER'] },
  { key: 'CHAPTER_SECRETARY', label: 'Chapter Secretary', scopeLevel: 'CHAPTER', rank: 20, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS, canOnboard: ['CONVENER', 'CO_CONVENER', 'MEMBER'] },
  { key: 'CHAPTER_TREASURER', label: 'Chapter Treasurer', scopeLevel: 'CHAPTER', rank: 20, isOfficeBearer: true,
    capabilities: ['chapter.view', 'chapter.payment.request', 'audit.view'], canOnboard: ['MEMBER'] },
  { key: 'CONVENER', label: 'Convener', scopeLevel: 'CHAPTER', rank: 30, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS.filter((c) => c !== 'member.offboard'), canOnboard: ['MEMBER'] },
  { key: 'CO_CONVENER', label: 'Co-Convener', scopeLevel: 'CHAPTER', rank: 35, isOfficeBearer: true,
    capabilities: ['chapter.view', 'chapter.broadcast', 'chapter.attendance.mark', 'member.onboard'], canOnboard: ['MEMBER'] },

  // legacy alias kept so existing data/guards keep working
  { key: 'CHAPTER_ADMIN', label: 'Chapter Admin', scopeLevel: 'CHAPTER', rank: 10, isOfficeBearer: true,
    capabilities: CHAPTER_OFFICER_CAPS, canOnboard: ['MEMBER', 'CONVENER', 'CO_CONVENER'] },

  { key: 'MEMBER', label: 'Member', scopeLevel: 'SELF', rank: 100, isOfficeBearer: false,
    capabilities: MEMBER_CAPS, canOnboard: [] },
];
