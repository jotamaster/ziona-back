import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HomeRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateHomeDto } from './dto/create-home.dto';
import { HomeResponseDto } from './dto/home-response.dto';

const ACTIVE_USER = { deletedAt: null };
const ACTIVE_HOME = { deletedAt: null };
const ACTIVE_MEMBERSHIP = { deletedAt: null };

@Injectable()
export class HomesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateHomeDto): Promise<HomeResponseDto> {
    await this.ensureActiveUser(userId);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('El nombre no puede estar vacío');
    }

    const home = await this.prisma.$transaction(async (tx) => {
      const created = await tx.home.create({
        data: {
          name,
          createdByUserId: userId,
        },
      });

      await tx.homeMember.create({
        data: {
          homeId: created.id,
          userId,
          role: HomeRole.owner,
        },
      });

      return created;
    });

    return HomeResponseDto.fromHome(home);
  }

  async findAllForUser(userId: string): Promise<HomeResponseDto[]> {
    await this.ensureActiveUser(userId);

    const homes = await this.prisma.home.findMany({
      where: {
        ...ACTIVE_HOME,
        members: {
          some: {
            userId,
            ...ACTIVE_MEMBERSHIP,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return homes.map((h) => HomeResponseDto.fromHome(h));
  }

  async findOneForUser(
    userId: string,
    homeId: string,
  ): Promise<HomeResponseDto> {
    await this.ensureActiveUser(userId);

    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ...ACTIVE_HOME },
    });

    if (!home) {
      throw new NotFoundException('Hogar no encontrado');
    }

    const membership = await this.prisma.homeMember.findFirst({
      where: {
        homeId,
        userId,
        ...ACTIVE_MEMBERSHIP,
      },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este hogar');
    }

    return HomeResponseDto.fromHome(home);
  }

  async softDeleteForCreator(userId: string, homeId: string): Promise<void> {
    await this.ensureActiveUser(userId);

    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ...ACTIVE_HOME },
    });

    if (!home) {
      throw new NotFoundException('Hogar no encontrado');
    }

    if (home.createdByUserId !== userId) {
      throw new ForbiddenException(
        'Solo el creador del hogar puede eliminarlo',
      );
    }

    await this.prisma.home.update({
      where: { id: homeId },
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
