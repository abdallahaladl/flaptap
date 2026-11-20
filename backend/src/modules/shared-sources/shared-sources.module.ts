import { Module } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesController } from './shared-sources.controller';
import { SharedSourcesRepository } from './shared-sources.repository';
import { SharedSourcesService } from './shared-sources.service';

@Module({
  controllers: [SharedSourcesController],
  providers: [SqliteService, AuthService, SharedSourcesRepository, SharedSourcesService],
  exports: [SharedSourcesService, SharedSourcesRepository],
})
export class SharedSourcesModule {}
