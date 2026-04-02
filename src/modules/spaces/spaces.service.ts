import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpaceRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSpaceDto } from './dto/create-space.dto';
import { SpaceMemberResponseDto } from './dto/space-member-response.dto';
import { SpaceResponseDto } from './dto/space-response.dto';

const ACTIVE_USER = { deletedAt: null };
const ACTIVE_SPACE = { deletedAt: null };
const ACTIVE_MEMBERSHIP = { deletedAt: null };

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSpaceDto): Promise<SpaceResponseDto> {
    await this.ensureActiveUser(userId);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('El nombre no puede estar vacío');
    }

    const space = await this.prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          name,
          createdByUserId: userId,
        },
      });

      await tx.spaceMember.create({
        data: {
          spaceId: created.id,
          userId,
          role: SpaceRole.owner,
        },
      });

      return created;
    });

    return SpaceResponseDto.fromSpace(space);
  }

  async findAllForUser(userId: string): Promise<SpaceResponseDto[]> {
    await this.ensureActiveUser(userId);

    const spaces = await this.prisma.space.findMany({
      where: {
        ...ACTIVE_SPACE,
        members: {
          some: {
            userId,
            ...ACTIVE_MEMBERSHIP,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return spaces.map((s) => SpaceResponseDto.fromSpace(s));
  }

  async findOneForUser(
    userId: string,
    spaceId: string,
  ): Promise<SpaceResponseDto> {
    await this.ensureActiveUser(userId);

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...ACTIVE_SPACE },
    });

    if (!space) {
      throw new NotFoundException('Espacio no encontrado');
    }

    const membership = await this.prisma.spaceMember.findFirst({
      where: {
        spaceId,
        userId,
        ...ACTIVE_MEMBERSHIP,
      },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este espacio');
    }

    return SpaceResponseDto.fromSpace(space);
  }

  async findMembersForUser(
    userId: string,
    spaceId: string,
  ): Promise<SpaceMemberResponseDto[]> {
    await this.ensureActiveUser(userId);

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...ACTIVE_SPACE },
      select: { id: true },
    });

    if (!space) {
      throw new NotFoundException('Espacio no encontrado');
    }

    const membership = await this.prisma.spaceMember.findFirst({
      where: {
        spaceId,
        userId,
        ...ACTIVE_MEMBERSHIP,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este espacio');
    }

    const rows = await this.prisma.spaceMember.findMany({
      where: {
        spaceId,
        ...ACTIVE_MEMBERSHIP,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            publicCode: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return rows.map((row) => {
      const dto = new SpaceMemberResponseDto();
      dto.userId = row.user.id;
      dto.name = row.user.name;
      dto.publicCode = row.user.publicCode;
      dto.imageUrl = row.user.imageUrl;
      dto.role = row.role;
      dto.joinedAt = row.joinedAt;
      return dto;
    });
  }

  async softDeleteForCreator(userId: string, spaceId: string): Promise<void> {
    await this.ensureActiveUser(userId);

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...ACTIVE_SPACE },
    });

    if (!space) {
      throw new NotFoundException('Espacio no encontrado');
    }

    if (space.createdByUserId !== userId) {
      throw new ForbiddenException(
        'Solo el creador del espacio puede eliminarlo',
      );
    }

    await this.prisma.space.update({
      where: { id: spaceId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: userId,
      },
    });
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...ACTIVE_USER },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }
}
