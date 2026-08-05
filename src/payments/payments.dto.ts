import { ArrayMinSize, IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class RequestPaymentDto {
  @IsString()
  @MinLength(1)
  chapterId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  memberIds: string[];

  @IsIn(['AD', 'QUARTERLY_MEETING', 'YEARLY_COMMUNITY', 'CUSTOM'])
  type: string;

  @IsNumber()
  @IsPositive()
  amountInr: number;

  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() upiId?: string;
  @IsOptional() @IsString() bankDetails?: string;
  @IsOptional() @IsString() gatesAdId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
}
