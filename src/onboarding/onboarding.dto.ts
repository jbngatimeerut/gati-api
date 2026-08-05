import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const ROLE_PATTERN = /^[A-Z_]{2,40}$/;

export class InviteDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @Matches(ROLE_PATTERN, { message: 'roleKey must be an uppercase role key' })
  roleKey: string;

  @IsString()
  @MinLength(1)
  chapterId: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() category?: string;
}
