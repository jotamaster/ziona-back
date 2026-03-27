import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds: string[];
}
