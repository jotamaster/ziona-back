import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Contrato del body en POST /users: qué campos acepta la API y cómo validarlos.
 * No tiene por qué coincidir 1:1 con el modelo de Prisma (p. ej. no incluimos id ni timestamps).
 */
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
