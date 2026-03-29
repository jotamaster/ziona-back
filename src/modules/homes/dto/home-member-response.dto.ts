import { HomeRole } from '@prisma/client';

export class HomeMemberResponseDto {
  userId: string;
  name: string;
  publicCode: string;
  imageUrl: string | null;
  role: HomeRole;
  joinedAt: Date;
}
