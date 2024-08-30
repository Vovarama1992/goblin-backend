import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UserService } from './user.service';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly jwtSecret = 'your_jwt_secret';
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly userService: UserService) {}

  createToken(user: User): string {
    const token = jwt.sign({ id: user.id }, this.jwtSecret, {
      expiresIn: '1h',
    });
    this.logger.log(`Token created for user ${user.id}`);
    return token;
  }

  async validateToken(token: string): Promise<User> {
    this.logger.log(`Validating token: ${token}`);
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { id: number };
      this.logger.log(`Token valid for user ID: ${decoded.id}`);
      return this.userService.findById(decoded.id);
    } catch (error) {
      this.logger.error(
        `Token validation error: ${error.message}`,
        error.stack,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
