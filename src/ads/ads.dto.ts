import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, MinLength } from 'class-validator';

const HEX_COLOR = /^#?[0-9A-Fa-f]{6}$/;
const AD_SLOTS = ['HOME_HERO', 'DIRECTORY_INLINE', 'PROFILE_FOOTER', 'SETU_INLINE', 'SPONSORS_PAGE'];

export class CreateTierDto {
  @IsOptional() @IsString() chapterId?: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() priority?: number;
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' }) color: string;
}

export class UpdateTierDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' }) color?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateSponsorDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() memberId?: string;
}

export class CreateCampaignDto {
  @IsOptional() @IsString() tierId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsString() sponsorId: string;
  @IsIn(AD_SLOTS, { message: `slot must be one of ${AD_SLOTS.join(', ')}` }) slot: string;
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsUrl({ require_protocol: true }) targetUrl: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() tierId?: string;
  @IsOptional() @IsIn(AD_SLOTS) slot?: string;
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) targetUrl?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
}
