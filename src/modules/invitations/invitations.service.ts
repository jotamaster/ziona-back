import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Invitation, InvitationStatus, HomeRole } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateInvitationDto } from './dto/create-invitation.dto';

const ACTIVE_USER = { deletedAt: null };
const ACTIVE_HOME = { deletedAt: null };
const ACTIVE_MEMBERSHIP = { deletedAt: null };
const ACTIVE_INVITATION = { deletedAt: null };

type SimpleHome = { id: string; name: string };
type SimpleUser = { id: string; name: string; publicCode: string };

export class InvitationResponseDto {
  id: string;
  homeId: string;
  invitedByUserId: string;
  invitedUserId: string;
  status: InvitationStatus;
  createdAt: Date;
  respondedAt: Date | null;

  static fromInvitation(invitation: Invitation): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.homeId = invitation.homeId;
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
  home: SimpleHome;
  invitedBy?: SimpleUser;
  invitedUser?: SimpleUser;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    homeId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveHome(homeId);
    await this.ensureActiveMembership(homeId, userId);

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

    const member = await this.prisma.homeMember.findFirst({
      where: { homeId, userId: invitedUser.id, ...ACTIVE_MEMBERSHIP },
      select: { id: true },
    });
    if (member) {
      throw new ConflictException('El usuario ya pertenece al hogar');
    }

    const duplicate = await this.prisma.invitation.findFirst({
      where: {
        homeId,
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
        homeId,
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
        home: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true, publicCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      status: invitation.status,
      createdAt: invitation.createdAt,
      respondedAt: invitation.respondedAt,
      home: invitation.home,
      invitedBy: invitation.invitedBy,
    }));
  }

  async findSent(userId: string): Promise<InvitationListItemDto[]> {
    await this.ensureActiveUser(userId);

    const invitations = await this.prisma.invitation.findMany({
      where: { invitedByUserId: userId, ...ACTIVE_INVITATION },
      include: {
        home: { select: { id: true, name: true } },
        invitedUser: { select: { id: true, name: true, publicCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      status: invitation.status,
      createdAt: invitation.createdAt,
      respondedAt: invitation.respondedAt,
      home: invitation.home,
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

    await this.ensureActiveHome(invitation.homeId);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existingMember = await tx.homeMember.findUnique({
          where: {
            homeId_userId: {
              homeId: invitation.homeId,
              userId,
            },
          },
        });

        console.log('existingMember', existingMember);

        if (existingMember && existingMember.deletedAt == null) {
          throw new ConflictException('El usuario ya pertenece al hogar');
        }

        if (existingMember) {
          await tx.homeMember.update({
            where: { id: existingMember.id },
            data: {
              role: HomeRole.member,
              joinedAt: new Date(),
              deletedAt: null,
            },
          });
        } else {
          await tx.homeMember.create({
            data: {
              homeId: invitation.homeId,
              userId,
              role: HomeRole.member,
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
        throw new ConflictException('El usuario ya pertenece al hogar');
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

  private async ensureActiveHome(homeId: string): Promise<void> {
    const home = await this.prisma.home.findFirst({
      where: { id: homeId, ...ACTIVE_HOME },
      select: { id: true },
    });
    if (!home) {
      throw new NotFoundException('Hogar no encontrado');
    }
  }

  private async ensureActiveMembership(homeId: string, userId: string): Promise<void> {
    const membership = await this.prisma.homeMember.findFirst({
      where: { homeId, userId, ...ACTIVE_MEMBERSHIP },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('No perteneces a este hogar');
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
