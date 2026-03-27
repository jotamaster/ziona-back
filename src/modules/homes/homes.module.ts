import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { HomesController } from './homes.controller';
import { HomesService } from './homes.service';

@Module({
  imports: [PrismaModule],
  controllers: [HomesController],
  providers: [HomesService],
})
export class HomesModule {}
