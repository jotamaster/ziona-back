import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Invitation, InvitationStatus, SpaceRole } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateInvitationDto } from './dto/create-invitation.dto';

const ACTIVE_USER = { deletedAt: null };
const ACTIVE_SPACE = { deletedAt: null };
const ACTIVE_MEMBERSHIP = { deletedAt: null };
const ACTIVE_INVITATION = { deletedAt: null };

type SimpleSpace = { id: string; name: string };
type SimpleUser = { id: string; name: string; publicCode: string };

export class InvitationResponseDto {
  id: string;
  spaceId: string;
  invitedByUserId: string;
  invitedUserId: string;
  status: InvitationStatus;
  createdAt: Date;
  respondedAt: Date | null;

  static fromInvitation(invitation: Invitation): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.spaceId = invitation.spaceId;
    dto.invitedByUserId = invitation.invitedByUserId;
    dto.invitedUserId = invitation.invitedUserId;
    dto.status = invitation.status;
    dto.createdAt = invitation.createdAt;
    dto.respondedAt = invitation.respondedAt;
    return dto;
  }
}

export class InvitationListItemDto {
  id: string;
  status: InvitationStatus;
  createdAt: Date;
  respondedAt: Date | null;
  space: SimpleSpace;
  invitedBy?: SimpleUser;
  invitedUser?: SimpleUser;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    spaceId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const publicCode = dto.publicCode.trim();
    if (!publicCode) {
      throw new BadRequestException('publicCode es requerido');
    }

    const invitedUser = await this.prisma.user.findFirst({
      where: { publicCode, ...ACTIVE_USER },
      select: { id: true },
    });
    if (!invitedUser) {
      throw new NotFoundException('Usuario invitado no encontrado');
    }

    if (invitedUser.id === userId) {
      throw new BadRequestException('No puedes invitarte a ti mismo');
    }

    const member = await this.prisma.spaceMember.findFirst({
      where: { spaceId, userId: invitedUser.id, ...ACTIVE_MEMBERSHIP },
      select: { id: true },
    });
    if (member) {
      throw new ConflictException('El usuario ya pertenece al espacio');
    }

    const duplicate = await this.prisma.invitation.findFirst({
      where: {
        spaceId,
        invitedUserId: invitedUser.id,
        status: InvitationStatus.pending,
        ...ACTIVE_INVITATION,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe una invitacion pendiente');
    }

    const invitation = await this.prisma.invitation.create({
      data: {
        spaceId,
        invitedByUserId: userId,
        invitedUserId: invitedUser.id,
        status: InvitationStatus.pending,
      },
    });

    return InvitationResponseDto.fromInvitation(invitation);
  }

  async findReceived(userId: string): Promise<InvitationListItemDto[]> {
    await this.ensureActiveUser(userId);

    const invitations = await this.prisma.invitation.findMany({
      where: { invitedUserId: userId, ...ACTIVE_INVITATION },
      include: {
        space: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true, publicCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      status: invitation.status,
      createdAt: invitation.createdAt,
      respondedAt: invitation.respondedAt,
      space: invitation.space,
      invitedBy: invitation.invitedBy,
    }));
  }

  async findSent(userId: string): Promise<InvitationListItemDto[]> {
    await this.ensureActiveUser(userId);

    const invitations = await this.prisma.invitation.findMany({
      where: { invitedByUserId: userId, ...ACTIVE_INVITATION },
      include: {
        space: { select: { id: true, name: true } },
        invitedUser: { select: { id: true, name: true, publicCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      status: invitation.status,
      createdAt: invitation.createdAt,
      respondedAt: invitation.respondedAt,
      space: invitation.space,
      invitedUser: invitation.invitedUser,
    }));
  }

  async accept(
    userId: string,
    invitationId: string,
  ): Promise<InvitationResponseDto> {
    await this.ensureActiveUser(userId);

    const invitation = await this.getActiveInvitation(invitationId);
    if (invitation.invitedUserId !== userId) {
      throw new ForbiddenException('Solo el usuario invitado puede aceptar');
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new ConflictException('La invitacion ya fue respondida');
    }

    await this.ensureActiveSpace(invitation.spaceId);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existingMember = await tx.spaceMember.findUnique({
          where: {
            spaceId_userId: {
              spaceId: invitation.spaceId,
              userId,
            },
          },
        });

        if (existingMember && existingMember.deletedAt == null) {
          throw new ConflictException('El usuario ya pertenece al espacio');
        }

        if (existingMember) {
          await tx.spaceMember.update({
            where: { id: existingMember.id },
            data: {
              role: SpaceRole.member,
              joinedAt: new Date(),
              deletedAt: null,
            },
          });
        } else {
          await tx.spaceMember.create({
            data: {
              spaceId: invitation.spaceId,
              userId,
              role: SpaceRole.member,
            },
          });
        }

        return tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.accepted,
            respondedAt: new Date(),
          },
        });
      });

      return InvitationResponseDto.fromInvitation(updated);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El usuario ya pertenece al espacio');
      }
      throw error;
    }
  }

  async reject(
    userId: string,
    invitationId: string,
  ): Promise<InvitationResponseDto> {
    await this.ensureActiveUser(userId);
    const invitation = await this.getActiveInvitation(invitationId);

    if (invitation.invitedUserId !== userId) {
      throw new ForbiddenException('Solo el usuario invitado puede rechazar');
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new ConflictException('La invitacion ya fue respondida');
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.rejected,
        respondedAt: new Date(),
      },
    });

    return InvitationResponseDto.fromInvitation(updated);
  }

  async cancel(
    userId: string,
    invitationId: string,
  ): Promise<InvitationResponseDto> {
    await this.ensureActiveUser(userId);
    const invitation = await this.getActiveInvitation(invitationId);

    if (invitation.invitedByUserId !== userId) {
      throw new ForbiddenException('Solo quien envio la invitacion puede cancelarla');
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new ConflictException('La invitacion ya fue respondida');
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.cancelled,
        respondedAt: new Date(),
      },
    });

    return InvitationResponseDto.fromInvitation(updated);
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...ACTIVE_USER },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  private async ensureActiveSpace(spaceId: string): Promise<void> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...ACTIVE_SPACE },
      select: { id: true },
    });
    if (!space) {
      throw new NotFoundException('Espacio no encontrado');
    }
  }

  private async ensureActiveMembership(spaceId: string, userId: string): Promise<void> {
    const membership = await this.prisma.spaceMember.findFirst({
      where: { spaceId, userId, ...ACTIVE_MEMBERSHIP },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('No perteneces a este espacio');
    }
  }

  private async getActiveInvitation(invitationId: string): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ...ACTIVE_INVITATION },
    });
    if (!invitation) {
      throw new NotFoundException('Invitacion no encontrada');
    }
    return invitation;
  }
}
