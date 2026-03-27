import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  InvitationListItemDto,
  InvitationResponseDto,
  InvitationsService,
} from './invitations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('homes/:homeId/invitations')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('homeId', ParseUUIDPipe) homeId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.create(currentUser.id, homeId, dto);
  }

  @Get('invitations/received')
  findReceived(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<InvitationListItemDto[]> {
    return this.invitationsService.findReceived(currentUser.id);
  }

  @Get('invitations/sent')
  findSent(@CurrentUser() currentUser: AuthenticatedUser): Promise<InvitationListItemDto[]> {
    return this.invitationsService.findSent(currentUser.id);
  }

  @Patch('invitations/:invitationId/accept')
  accept(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.accept(currentUser.id, invitationId);
  }

  @Patch('invitations/:invitationId/reject')
  reject(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.reject(currentUser.id, invitationId);
  }

  @Patch('invitations/:invitationId/cancel')
  cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.cancel(currentUser.id, invitationId);
  }
}
