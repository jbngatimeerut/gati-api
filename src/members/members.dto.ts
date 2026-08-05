import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// This app's role keys are split across two overlapping-but-different lists (auth/leadership.ts's
// LEADERSHIP and hierarchy/permissions.ts's DEFAULT_ROLES), so a hardcoded exact enum here would
// reject real, currently-in-use roles that only exist in one of the two lists. This pattern check
// is the safe middle ground: blocks garbage/injection-shaped values without depending on the app
// finishing that pre-existing role-taxonomy cleanup first.
const ROLE_PATTERN = /^[A-Z_]{2,40}$/;

export class CreateMemberDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsString() about?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() productImages?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() chapterId?: string;

  @IsOptional() @IsBoolean() verified?: boolean;
  @IsOptional() @IsIn(['NONE', 'PATRON', 'CP', 'FCP']) jitoMembership?: string;
  @IsOptional() @Matches(ROLE_PATTERN, { message: 'role must be an uppercase role key' }) role?: string;
}

export class UpdateSelfDto {
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsString() about?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() productImages?: string;
  @IsOptional() @IsString() labels?: string;
}
