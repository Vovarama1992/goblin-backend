import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { UserService } from './services/user.service';
import { AuthService } from './services/auth.service';
import { WalletService } from './services/wallet.service';
import { UserDto } from './types/user.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly walletService: WalletService,
  ) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully with wallet',
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @Post('register')
  async register(@Body() userDto: UserDto) {
    try {
      const user = await this.userService.register(userDto);

      const wallet = await this.walletService.createTronWallet(user.id);

      return {
        message: 'User registered successfully with wallet',
        user,
        wallet,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @ApiOperation({ summary: 'Log in a user' })
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Post('login')
  async login(@Body() userDto: UserDto) {
    const user = await this.userService.validateUser(
      userDto.email,
      userDto.password,
    );
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const token = this.authService.createToken(user);

    return { token }; // Возвращаем объект с ключом token
  }
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({ status: 200, description: 'Returns current user information' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('me')
  async getMe(@Req() req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new HttpException(
        'Authorization header missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.replace('Bearer ', '');
    try {
      const user = await this.authService.validateToken(token);
      return user;
    } catch (e) {
      throw new HttpException(
        'Invalid or expired token',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Get('wallets/:userId')
  async getWalletsByUserId(@Param('userId') userId: number) {
    const id = Number(userId);
    return this.walletService.getUserWalletsWithBalances(id);
  }

  @ApiOperation({ summary: 'Create a new wallet for the user' })
  @Post('wallet/:userId')
  async createWallet(@Param('userId') userId: string) {
    const id = Number(userId);
    try {
      const wallet = await this.walletService.createTronWallet(id);
      return wallet;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
