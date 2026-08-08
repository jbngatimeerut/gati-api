import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

const HEX_COLOR = /^#?[0-9A-Fa-f]{6}$/;
// A campaign is assigned to exactly one of these; "HOME_TOP" is a synthetic fifth placement
// (see schema.prisma AdSlot comment) and is never a value stored here.
export const AD_SLOTS = ['HOME_HERO', 'DIRECTORY_INLINE', 'PROFILE_FOOTER', 'SETU_INLINE'];
// Every creative/logo field must be either our own uploaded-file path or a plain https(s) URL —
// never a javascript:/data:/vbscript: URI, which is how an <a href> or <img src> field turns into
// a stored-XSS vector.
const MEDIA_PATH = /^(\/api\/uploads\/[a-zA-Z0-9._-]+|https:\/\/[^\s"'<>]+)$/;

export class CreateTierDto {
  @IsOptional() @IsString() chapterId?: string;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsInt() priority?: number;
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' }) color: string;
}

export class UpdateTierDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' }) color?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateSponsorDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(200) contact?: string;
  @IsOptional() @IsString() memberId?: string;
}

export class CreateCampaignDto {
  @IsOptional() @IsString() tierId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsString() sponsorId: string;
  @IsIn(AD_SLOTS, { message: `slot must be one of ${AD_SLOTS.join(', ')}` }) slot: string;
  @IsString() @MinLength(1) @MaxLength(120) title: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'imageUrl must be an uploaded file or an https URL' }) imageUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'videoUrl must be an uploaded file or an https URL' }) videoUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'logoUrl must be an uploaded file or an https URL' }) logoUrl?: string;
  // Optional: when the sponsor is a linked member, AdsService resolves the "Connect" link to
  // their profile automatically and this is ignored. Required only for non-member sponsors.
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) targetUrl?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() tierId?: string;
  @IsOptional() @IsIn(AD_SLOTS) slot?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) title?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'imageUrl must be an uploaded file or an https URL' }) imageUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'videoUrl must be an uploaded file or an https URL' }) videoUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'logoUrl must be an uploaded file or an https URL' }) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) targetUrl?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}

// Leadership sets the run window only at activation time — no payment gateway, so this is the
// point where they've confirmed the offline payment and are committing to a schedule.
export class ActivateCampaignDto {
  @IsISO8601() startsAt: string;
  @IsISO8601() endsAt: string;
}

export class CreateAdSignupInviteDto {
  @IsString() memberId: string;
  @IsOptional() @IsString() tierId?: string;
  @IsISO8601() deadline: string;
}

// Slot and creative only — tierId is never accepted here, it comes from the invite record itself
// so an invited member can't submit a higher tier than the one leadership actually offered them.
export class SubmitAdSignupDto {
  @IsIn(AD_SLOTS, { message: `slot must be one of ${AD_SLOTS.join(', ')}` }) slot: string;
  @IsString() @MinLength(1) @MaxLength(120) title: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'imageUrl must be an uploaded file or an https URL' }) imageUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'videoUrl must be an uploaded file or an https URL' }) videoUrl?: string;
  @IsOptional() @Matches(MEDIA_PATH, { message: 'logoUrl must be an uploaded file or an https URL' }) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) targetUrl?: string;
}

export class CreateAdDealDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amountInr: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
