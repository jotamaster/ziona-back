import { HomeRole } from '@prisma/client';

export class HomeMemberResponseDto {
  userId: string;
  name: string;
  publicCode: string;
  role: HomeRole;
  joinedAt: Date;
}
