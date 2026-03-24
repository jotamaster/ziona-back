import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const ACTIVE_USER = { deletedAt: null as null };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const publicCode = this.generatePublicCode();
      try {
        const user = await this.prisma.user.create({
          data: {
            email,
            name: dto.name.trim(),
            imageUrl: dto.imageUrl,
            publicCode,
          },
        });
        return UserResponseDto.fromUser(user);
      } catch (e) {
        if (
          e instanceof PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          const fields = this.uniqueConstraintFields(e);
          if (fields.includes('email')) {
            throw new ConflictException('El email ya está registrado');
          }
          if (fields.includes('publicCode')) {
            continue;
          }
        }
        throw e;
      }
    }

    throw new ConflictException(
      'No se pudo generar un código público único; reintenta.',
    );
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, ...ACTIVE_USER },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return UserResponseDto.fromUser(user);
  }

  /**
   * Resuelve invitaciones por `publicCode` (solo usuarios activos).
   */
  async findByPublicCode(publicCode: string): Promise<UserResponseDto> {
    const code = publicCode.trim();
    if (!code) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.prisma.user.findFirst({
      where: { publicCode: code, ...ACTIVE_USER },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return UserResponseDto.fromUser(user);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private generatePublicCode(): string {
    return randomBytes(9).toString('base64url').slice(0, 16);
  }

  /** Prisma 7 + driver adapter usa `constraint.fields`; versiones anteriores usaban `meta.target`. */
  private uniqueConstraintFields(
    error: PrismaClientKnownRequestError,
  ): string[] {
    const meta = error.meta as Record<string, unknown> | undefined;
    const legacy = meta?.target;
    if (Array.isArray(legacy) && legacy.every((x) => typeof x === 'string')) {
      return legacy as string[];
    }
    const adapter = meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: string[] } } }
      | undefined;
    const fields = adapter?.cause?.constraint?.fields;
    return Array.isArray(fields) ? fields : [];
  }
}
