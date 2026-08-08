import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Public, unauthenticated endpoint (POST /m/:slug/lead) — anyone with a member's card/profile
// link can submit one, so every field is validated and length-capped even though it's low-stakes
// data, and none of it is ever rendered as raw HTML.
export class CreateLeadDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(200) interests?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  // Set when the lead came from an ad's "Connect" CTA — AdsService silently drops it if it
  // doesn't resolve to a real campaign, so a forged/stale id never breaks lead capture.
  @IsOptional() @IsString() campaignId?: string;
}
