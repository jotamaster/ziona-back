import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateSpaceDto } from './dto/create-space.dto';
import { SpaceMemberResponseDto } from './dto/space-member-response.dto';
import { SpaceResponseDto } from './dto/space-response.dto';
import { SpacesService } from './spaces.service';

@Controller('spaces')
@UseGuards(JwtAuthGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateSpaceDto,
  ): Promise<SpaceResponseDto> {
    return this.spacesService.create(currentUser.id, dto);
  }

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser): Promise<SpaceResponseDto[]> {
    return this.spacesService.findAllForUser(currentUser.id);
  }

  @Get(':spaceId/members')
  findMembers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ): Promise<SpaceMemberResponseDto[]> {
    return this.spacesService.findMembersForUser(currentUser.id, spaceId);
  }

  @Get(':spaceId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ): Promise<SpaceResponseDto> {
    return this.spacesService.findOneForUser(currentUser.id, spaceId);
  }

  @Delete(':spaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ): Promise<void> {
    await this.spacesService.softDeleteForCreator(currentUser.id, spaceId);
  }
}
