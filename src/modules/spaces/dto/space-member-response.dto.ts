import { SpaceRole } from '@prisma/client';

export class SpaceMemberResponseDto {
  userId: string;
  name: string;
  publicCode: string;
  imageUrl: string | null;
  role: SpaceRole;
  joinedAt: Date;
}
