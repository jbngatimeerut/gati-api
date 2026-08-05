import { IsString, IsUUID, MinLength } from 'class-validator';

export class HandshakeDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @MinLength(1)
  encryptedKey: string;
}
