import { IsEmail, IsString, IsIn, IsOptional, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsIn(['game', 'forum'])
  platform: 'game' | 'forum';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceInfo?: string;
}
