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

import { CreateHomeDto } from './dto/create-home.dto';
import { HomeMemberResponseDto } from './dto/home-member-response.dto';
import { HomeResponseDto } from './dto/home-response.dto';
import { HomesService } from './homes.service';

@Controller('homes')
@UseGuards(JwtAuthGuard)
export class HomesController {
  constructor(private readonly homesService: HomesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateHomeDto,
  ): Promise<HomeResponseDto> {
    return this.homesService.create(currentUser.id, dto);
  }

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser): Promise<HomeResponseDto[]> {
    return this.homesService.findAllForUser(currentUser.id);
  }

  @Get(':homeId/members')
  findMembers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('homeId', ParseUUIDPipe) homeId: string,
  ): Promise<HomeMemberResponseDto[]> {
    return this.homesService.findMembersForUser(currentUser.id, homeId);
  }

  @Get(':homeId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('homeId', ParseUUIDPipe) homeId: string,
  ): Promise<HomeResponseDto> {
    return this.homesService.findOneForUser(currentUser.id, homeId);
  }

  @Delete(':homeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('homeId', ParseUUIDPipe) homeId: string,
  ): Promise<void> {
    await this.homesService.softDeleteForCreator(currentUser.id, homeId);
  }
}
