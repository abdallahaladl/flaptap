import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AuditLogRepository } from './audit-log.repository';
import { DataLifecycleService } from './data-lifecycle.service';
import { WorkspaceResetOptions } from './data-lifecycle.types';

@Controller('api/lifecycle')
export class DataLifecycleController {
  constructor(
    private readonly lifecycle: DataLifecycleService,
    private readonly auditLog: AuditLogRepository,
    private readonly authService: AuthService,
  ) {}

  @Get('summary')
  getSummary(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.lifecycle.getLifecycleSummary(identity.userId);
  }

  @Get('audit')
  listAudit(
    @Req() req: Request,
    @Query('feature') feature?: string,
    @Query('limit') limit?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const parsedLimit = limit ? Number(limit) : undefined;
    return {
      success: true,
      events: this.auditLog.list(identity.userId, {
        feature,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      }),
    };
  }

  @Delete('audit/:id')
  deleteAuditEvent(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: this.auditLog.deleteById(identity.userId, id),
    };
  }

  @Post('audit/clear')
  clearAuditLog(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removedCount = this.auditLog.clearAll(identity.userId);
    return {
      success: true,
      removedCount,
    };
  }

  @Post('purge/lesson/:id')
  purgeLesson(
    @Param('id') id: string,
    @Body()
    body: { removeLinkedVocab?: boolean; cascadeLinkedNotes?: boolean } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.lifecycle.purgeLesson(identity.userId, id, {
      removeLinkedVocab: Boolean(body?.removeLinkedVocab),
      cascadeLinkedNotes: Boolean(body?.cascadeLinkedNotes),
    });
    return {
      success: res.deleted,
      purged: res.purged,
      auditEvent: res.auditEvent,
    };
  }

  @Post('purge/feature')
  purgeFeature(
    @Body()
    body:
      | {
          feature?: string;
          domainId?: string;
          removeLinkedVocab?: boolean;
          cascadeLinked?: boolean;
        }
      | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const feature = String(body?.feature || '').trim();
    if (!feature) {
      throw new BadRequestException('Field "feature" is required.');
    }
    return {
      success: true,
      feature,
      ...this.lifecycle.purgeFeature(identity.userId, feature, {
        domainId: body?.domainId,
        removeLinkedVocab: Boolean(body?.removeLinkedVocab),
        cascadeLinked: Boolean(body?.cascadeLinked),
      }),
    };
  }

  @Delete('sources/:id')
  deleteSharedSource(
    @Param('id') id: string,
    @Query('cascade') cascade: string | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.lifecycle.purgeSharedSource(identity.userId, id, {
      cascadeLinked: cascade === '1' || cascade === 'true',
    });
    return {
      success: res.deleted,
      purged: res.purged,
      auditEvent: res.auditEvent,
    };
  }

  @Post('workspace-reset')
  resetWorkspace(@Body() body: WorkspaceResetOptions | undefined, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.lifecycle.resetWorkspace(identity.userId, body || {});
  }
}
