import { Home } from '@prisma/client';

/**
 * Respuesta mínima del hogar en la API (sin relaciones cargadas).
 */
export class HomeResponseDto {
  id: string;
  name: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;

  static fromHome(home: Home): HomeResponseDto {
    const dto = new HomeResponseDto();
    dto.id = home.id;
    dto.name = home.name;
    dto.createdByUserId = home.createdByUserId;
    dto.createdAt = home.createdAt;
    dto.updatedAt = home.updatedAt;
    return dto;
  }
}
