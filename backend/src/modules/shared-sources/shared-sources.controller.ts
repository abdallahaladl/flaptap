import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import * as fs from 'fs';
import { Request, Response } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesService } from './shared-sources.service';

@Controller('api/sources')
export class SharedSourcesController {
  constructor(
    private readonly sharedSources: SharedSourcesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  listSources(@Req() req: Request, @Query('limit') limit?: string) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      items: this.sharedSources.listForUser(identity.userId, limit ? Number(limit) : 50),
    };
  }

  @Get('resolve-links')
  resolveLinks(
    @Req() req: Request,
    @Query('sourceId') sourceId?: string,
    @Query('noteId') noteId?: string,
    @Query('lessonId') lessonId?: string,
    @Query('url') url?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.sharedSources.resolveLinks(identity.userId, {
        sourceId,
        noteId,
        lessonId,
        url,
      }),
    };
  }

  /**
   * Streams persisted user-owned audio/video with HTTP 206 Range support
   * for millisecond-accurate clip playback and seeking.
   */
  @Get('media/:mediaId')
  streamMedia(@Param('mediaId') mediaId: string, @Req() req: Request, @Res() res: Response) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const resolved = this.sharedSources.resolveMediaFileForUser(identity.userId, mediaId);
    if (!resolved) {
      throw new NotFoundException('Media file not found or unavailable.');
    }

    const { filePath, mimeType, size } = resolved;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
        return;
      }

      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Length', String(size));
    fs.createReadStream(filePath).pipe(res);
  }
}
