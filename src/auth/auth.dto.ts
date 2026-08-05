import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class VerifyOtpDto {
  @IsString()
  @MinLength(1)
  challengeId: string;

  @IsString()
  @MinLength(1)
  code: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
