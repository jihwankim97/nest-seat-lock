import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * 간단한 헤더 기반 인증
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      this.logger.warn(`Unauthorized request to ${request.path}`);
      throw new UnauthorizedException('User ID is required in X-User-Id header');
    }

    (request as any).user = { id: userId };

    return true;
  }
}

