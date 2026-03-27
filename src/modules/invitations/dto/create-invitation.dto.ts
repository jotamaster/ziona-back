import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  publicCode: string;
}
