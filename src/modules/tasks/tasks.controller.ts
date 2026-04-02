import {
  Body,
  Controller,
  Delete,
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

import { AssignUsersDto } from './dto/assign-users.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  TaskEventResponseDto,
  TaskResponseDto,
  TasksService,
} from './tasks.service';

@Controller('spaces/:spaceId/tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(currentUser.id, spaceId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
  ): Promise<TaskResponseDto[]> {
    return this.tasksService.findAll(currentUser.id, spaceId);
  }

  @Get(':taskId/events')
  findEvents(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskEventResponseDto[]> {
    return this.tasksService.findEvents(currentUser.id, spaceId, taskId);
  }

  @Get(':taskId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.findOne(currentUser.id, spaceId, taskId);
  }

  @Patch(':taskId/complete')
  complete(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.complete(currentUser.id, spaceId, taskId);
  }

  @Patch(':taskId/reopen')
  reopen(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.reopen(currentUser.id, spaceId, taskId);
  }

  @Patch(':taskId')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(currentUser.id, spaceId, taskId, dto);
  }

  @Post(':taskId/assignees')
  assign(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AssignUsersDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.assignUsers(currentUser.id, spaceId, taskId, dto);
  }

  @Delete(':taskId/assignees/:userId')
  unassign(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.unassignUser(
      currentUser.id,
      spaceId,
      taskId,
      targetUserId,
    );
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    await this.tasksService.softDelete(currentUser.id, spaceId, taskId);
  }
}
