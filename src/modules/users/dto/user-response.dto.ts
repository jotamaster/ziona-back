import { User } from '@prisma/client';

/**
 * Forma pública del usuario en respuestas HTTP (sin relaciones ni campos internos).
 */
export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  publicCode: string;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;

  static fromUser(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.publicCode = user.publicCode;
    dto.imageUrl = user.imageUrl;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
