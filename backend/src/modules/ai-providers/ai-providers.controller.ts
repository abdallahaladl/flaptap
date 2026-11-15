import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { requireAuthenticatedUser, resolveRequestIdentity } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AddUserApiKeyDto, AiProvidersService } from './ai-providers.service';

@Controller('api/ai-providers')
export class AiProvidersController {
  constructor(
    private readonly aiProviders: AiProvidersService,
    private readonly authService: AuthService,
  ) {}

  @Get('presets')
  getPresets() {
    return {
      success: true,
      presets: this.aiProviders.getPresets(),
    };
  }

  /**
   * Lists all available provider key profiles (system env keys + authenticated user's BYOK keys).
   * Raw keys are never serialized; secret tails are omitted for anonymous visitors.
   */
  @Get('keys')
  listKeys(@Req() req: Request) {
    const identity = resolveRequestIdentity(req, this.authService);
    const keys = this.aiProviders.listAvailableKeys(identity.userId);
    return {
      success: true,
      count: keys.length,
      keys,
    };
  }

  /**
   * Queries THAT exact key's upstream provider /models endpoint in real time,
   * enriches models with live reasoning/effort capabilities, and returns live state.
   */
  @Get('keys/:keyId/models')
  async getModelsForKey(
    @Param('keyId') keyId: string,
    @Query('refresh') refresh: string | undefined,
    @Req() req: Request,
  ) {
    const decodedKeyId = decodeURIComponent(String(keyId || ''));
    const identity = resolveRequestIdentity(req, this.authService);

    if (decodedKeyId.startsWith('vault:') && !identity.userId) {
      throw new HttpException(
        { code: 'auth_required', message: 'Sign in required to access your personal saved API key.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const forceRefresh = refresh === 'true' || refresh === '1';
    try {
      const discovery = await this.aiProviders.fetchModelsForKey(
        decodedKeyId,
        identity.userId,
        forceRefresh,
      );
      return {
        success: true,
        ...discovery,
      };
    } catch (err: any) {
      throw new HttpException(
        err?.message || 'Unable to inspect models for this API key.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('keys')
  async addKey(@Body() dto: AddUserApiKeyDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!dto?.providerId) {
      throw new BadRequestException('providerId is required.');
    }

    const result = await this.aiProviders.addUserKey(identity.userId, dto);
    return {
      success: true,
      ...result,
    };
  }

  @Delete('keys/:keyId')
  deleteKey(@Param('keyId') keyId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const deleted = this.aiProviders.deleteUserKey(
      identity.userId,
      decodeURIComponent(String(keyId || '')),
    );
    return {
      success: deleted,
    };
  }
}
