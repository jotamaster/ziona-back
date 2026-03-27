import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateHomeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}
