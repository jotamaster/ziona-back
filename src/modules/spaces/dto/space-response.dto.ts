import { Space } from '@prisma/client';

/**
 * Respuesta mínima del espacio en la API (sin relaciones cargadas).
 */
export class SpaceResponseDto {
  id: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;

  static fromSpace(space: Space): SpaceResponseDto {
    const dto = new SpaceResponseDto();
    dto.id = space.id;
    dto.name = space.name;
    dto.createdByUserId = space.createdByUserId;
    dto.createdAt = space.createdAt;
    dto.updatedAt = space.updatedAt;
    return dto;
  }
}
