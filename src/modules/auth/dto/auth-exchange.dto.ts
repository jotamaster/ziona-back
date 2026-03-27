import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AuthExchangeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @IsString()
  @MaxLength(255)
  googleSub: string;
}
