import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [PrismaModule],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
