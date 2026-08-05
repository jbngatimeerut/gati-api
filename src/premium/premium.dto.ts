import { IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const HEX_COLOR = /^#?[0-9A-Fa-f]{6}$/;

export class CreateCategoryDto {
  @IsOptional() @IsString() chapterId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional() @IsInt() priority?: number;

  @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' })
  color: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @Matches(HEX_COLOR, { message: 'color must be a hex value like #D4AF37' }) color?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetCategoryPermissionDto {
  @IsBoolean()
  enabled: boolean;
}
