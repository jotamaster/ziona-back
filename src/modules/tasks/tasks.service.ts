import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Task,
  TaskEventType,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AssignUsersDto } from './dto/assign-users.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const ACTIVE_USER = { deletedAt: null as null };
const ACTIVE_SPACE = { deletedAt: null as null };
const ACTIVE_MEMBERSHIP = { deletedAt: null as null };
const ACTIVE_TASK = { deletedAt: null as null };
const ACTIVE_ASSIGNEE = { unassignedAt: null as null };

export type MinimalUserDto = {
  id: string;
  name: string;
  publicCode: string;
};

export type TaskComputedStatus = 'completed' | 'expired' | 'pending';

export type TaskAssigneeRowDto = {
  id: string;
  userId: string;
  assignedAt: Date;
  user: MinimalUserDto;
};

export class TaskResponseDto {
  id: string;
  spaceId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  status: TaskStatus;
  computedStatus: TaskComputedStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  createdByUser: MinimalUserDto;
  updatedByUser: MinimalUserDto;
  completedByUser: MinimalUserDto | null;
  assignees: TaskAssigneeRowDto[];
}

export class TaskEventResponseDto {
  id: string;
  type: TaskEventType;
  payload: unknown;
  createdAt: Date;
  actor: MinimalUserDto;
}

const taskInclude = {
  assignees: {
    where: { ...ACTIVE_ASSIGNEE },
    include: {
      user: { select: { id: true, name: true, publicCode: true } },
    },
    orderBy: { assignedAt: 'desc' as const },
  },
  createdByUser: { select: { id: true, name: true, publicCode: true } },
  updatedByUser: { select: { id: true, name: true, publicCode: true } },
  completedByUser: { select: { id: true, name: true, publicCode: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    spaceId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('El titulo no puede estar vacio');
    }

    const description =
      dto.description === undefined ? undefined : dto.description.trim();
    const assigneeIds = this.uniqueUuids(dto.assigneeUserIds ?? []);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          spaceId,
          title,
          description: description ?? null,
          priority: dto.priority ?? TaskPriority.medium,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: TaskStatus.pending,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });

      if (assigneeIds.length) {
        await this.assertUsersAreActiveSpaceMembers(tx, spaceId, assigneeIds);
        for (const uid of assigneeIds) {
          await tx.taskAssignee.create({
            data: {
              taskId: created.id,
              userId: uid,
              assignedByUserId: userId,
            },
          });
        }
      }

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          actorUserId: userId,
          type: TaskEventType.task_created,
          payload: {
            title: created.title,
            description: created.description,
            priority: created.priority,
            dueDate: created.dueDate,
          },
        },
      });

      if (assigneeIds.length) {
        await tx.taskEvent.create({
          data: {
            taskId: created.id,
            actorUserId: userId,
            type: TaskEventType.task_assigned,
            payload: { userIds: assigneeIds },
          },
        });
      }

      return created;
    });

    return this.findOne(userId, spaceId, task.id);
  }

  async findAll(userId: string, spaceId: string): Promise<TaskResponseDto[]> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const tasks = await this.prisma.task.findMany({
      where: { spaceId, ...ACTIVE_TASK },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return tasks.map((t) => this.mapTaskToResponse(t, now));
  }

  async findOne(
    userId: string,
    spaceId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, spaceId, ...ACTIVE_TASK },
      include: taskInclude,
    });
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }

    return this.mapTaskToResponse(task, new Date());
  }

  async update(
    userId: string,
    spaceId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const existing = await this.getActiveTaskForSpace(spaceId, taskId);

    if (!this.hasUpdatePayload(dto)) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const data: Prisma.TaskUpdateInput = { updatedByUser: { connect: { id: userId } } };
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (dto.title !== undefined) {
      const next = dto.title.trim();
      if (!next) {
        throw new BadRequestException('El titulo no puede estar vacio');
      }
      if (next !== existing.title) {
        changes.title = { from: existing.title, to: next };
      }
      data.title = next;
    }

    if (dto.description !== undefined) {
      const next =
        dto.description === null ? null : dto.description.trim();
      if (next !== existing.description) {
        changes.description = { from: existing.description, to: next };
      }
      data.description = next;
    }

    if (dto.priority !== undefined) {
      if (dto.priority !== existing.priority) {
        changes.priority = { from: existing.priority, to: dto.priority };
      }
      data.priority = dto.priority;
    }

    if (dto.dueDate !== undefined) {
      const next =
        dto.dueDate === null ? null : new Date(dto.dueDate);
      const prev = existing.dueDate;
      const prevMs = prev ? prev.getTime() : null;
      const nextMs = next ? next.getTime() : null;
      if (prevMs !== nextMs) {
        changes.dueDate = { from: prev, to: next };
      }
      data.dueDate = next;
    }

    if (Object.keys(changes).length === 0) {
      return this.findOne(userId, spaceId, taskId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data,
      });
      await tx.taskEvent.create({
        data: {
          taskId: existing.id,
          actorUserId: userId,
          type: TaskEventType.task_updated,
          payload: { changes } as Prisma.InputJsonValue,
        },
      });
    });

    return this.findOne(userId, spaceId, taskId);
  }

  async complete(
    userId: string,
    spaceId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const existing = await this.getActiveTaskForSpace(spaceId, taskId);
    if (existing.status === TaskStatus.completed) {
      throw new ConflictException('La tarea ya esta completada');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: {
          status: TaskStatus.completed,
          completedAt: now,
          completedByUserId: userId,
          updatedByUserId: userId,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: existing.id,
          actorUserId: userId,
          type: TaskEventType.task_completed,
          payload: { completedAt: now.toISOString() },
        },
      });
    });

    return this.findOne(userId, spaceId, taskId);
  }

  async reopen(
    userId: string,
    spaceId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const existing = await this.getActiveTaskForSpace(spaceId, taskId);
    if (existing.status !== TaskStatus.completed) {
      throw new ConflictException('La tarea no esta completada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: {
          status: TaskStatus.pending,
          completedAt: null,
          completedByUserId: null,
          updatedByUserId: userId,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: existing.id,
          actorUserId: userId,
          type: TaskEventType.task_reopened,
          payload: {},
        },
      });
    });

    return this.findOne(userId, spaceId, taskId);
  }

  async softDelete(
    userId: string,
    spaceId: string,
    taskId: string,
  ): Promise<void> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    const existing = await this.getActiveTaskForSpace(spaceId, taskId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: existing.id },
        data: {
          deletedAt: now,
          deletedByUserId: userId,
          updatedByUserId: userId,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: existing.id,
          actorUserId: userId,
          type: TaskEventType.task_deleted,
          payload: { deletedAt: now.toISOString() },
        },
      });
    });
  }

  async assignUsers(
    userId: string,
    spaceId: string,
    taskId: string,
    dto: AssignUsersDto,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    await this.getActiveTaskForSpace(spaceId, taskId);

    const userIds = this.uniqueUuids(dto.userIds);
    await this.assertUsersAreActiveSpaceMembers(this.prisma, spaceId, userIds);

    await this.prisma.$transaction(async (tx) => {
      for (const uid of userIds) {
        const row = await tx.taskAssignee.findUnique({
          where: {
            taskId_userId: { taskId, userId: uid },
          },
        });

        if (row && row.unassignedAt == null) {
          throw new ConflictException('El usuario ya esta asignado');
        }

        if (row && row.unassignedAt != null) {
          await tx.taskAssignee.update({
            where: { id: row.id },
            data: {
              unassignedAt: null,
              assignedByUserId: userId,
              assignedAt: new Date(),
            },
          });
        } else {
          await tx.taskAssignee.create({
            data: {
              taskId,
              userId: uid,
              assignedByUserId: userId,
            },
          });
        }
      }

      await tx.task.update({
        where: { id: taskId },
        data: { updatedByUserId: userId },
      });

      await tx.taskEvent.create({
        data: {
          taskId,
          actorUserId: userId,
          type: TaskEventType.task_assigned,
          payload: { userIds },
        },
      });
    });

    return this.findOne(userId, spaceId, taskId);
  }

  async unassignUser(
    userId: string,
    spaceId: string,
    taskId: string,
    targetUserId: string,
  ): Promise<TaskResponseDto> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    await this.getActiveTaskForSpace(spaceId, taskId);

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.taskAssignee.findFirst({
        where: {
          taskId,
          userId: targetUserId,
          ...ACTIVE_ASSIGNEE,
        },
      });

      if (!row) {
        throw new NotFoundException('Asignacion no encontrada');
      }

      const now = new Date();
      await tx.taskAssignee.update({
        where: { id: row.id },
        data: { unassignedAt: now },
      });

      await tx.task.update({
        where: { id: taskId },
        data: { updatedByUserId: userId },
      });

      await tx.taskEvent.create({
        data: {
          taskId,
          actorUserId: userId,
          type: TaskEventType.task_unassigned,
          payload: { userId: targetUserId, unassignedAt: now.toISOString() },
        },
      });
    });

    return this.findOne(userId, spaceId, taskId);
  }

  async findEvents(
    userId: string,
    spaceId: string,
    taskId: string,
  ): Promise<TaskEventResponseDto[]> {
    await this.ensureActiveUser(userId);
    await this.ensureActiveSpace(spaceId);
    await this.ensureActiveMembership(spaceId, userId);

    await this.getActiveTaskForSpace(spaceId, taskId);

    const events = await this.prisma.taskEvent.findMany({
      where: { taskId },
      include: {
        actor: { select: { id: true, name: true, publicCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return events.map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
      actor: e.actor,
    }));
  }

  private mapTaskToResponse(task: TaskWithRelations, now: Date): TaskResponseDto {
    return {
      id: task.id,
      spaceId: task.spaceId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status,
      computedStatus: this.computeComputedStatus(task, now),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      createdByUser: task.createdByUser,
      updatedByUser: task.updatedByUser,
      completedByUser: task.completedByUser,
      assignees: task.assignees.map((a) => ({
        id: a.id,
        userId: a.userId,
        assignedAt: a.assignedAt,
        user: a.user,
      })),
    };
  }

  private computeComputedStatus(task: Task, now: Date): TaskComputedStatus {
    if (task.status === TaskStatus.completed) {
      return 'completed';
    }
    if (task.dueDate && task.dueDate < now) {
      return 'expired';
    }
    return 'pending';
  }

  private hasUpdatePayload(dto: UpdateTaskDto): boolean {
    return (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.priority !== undefined ||
      dto.dueDate !== undefined
    );
  }

  private uniqueUuids(ids: string[]): string[] {
    return [...new Set(ids)];
  }

  private async getActiveTaskForSpace(
    spaceId: string,
    taskId: string,
  ): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, spaceId, ...ACTIVE_TASK },
    });
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }
    return task;
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

  private async ensureActiveMembership(
    spaceId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.prisma.spaceMember.findFirst({
      where: { spaceId, userId, ...ACTIVE_MEMBERSHIP },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('No perteneces a este espacio');
    }
  }

  private async assertUsersAreActiveSpaceMembers(
    db: Prisma.TransactionClient | PrismaService,
    spaceId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const members = await db.spaceMember.findMany({
      where: {
        spaceId,
        userId: { in: userIds },
        ...ACTIVE_MEMBERSHIP,
      },
      select: { userId: true },
    });

    if (members.length !== userIds.length) {
      throw new BadRequestException(
        'Uno o mas usuarios no son miembros activos del espacio',
      );
    }
  }
}
