import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from './services/user.service';
import { UserController } from './user.controller';
import { WalletService } from './services/wallet.service';
import { PrismaService } from './services/prisma.service';
import { AuthService } from './services/auth.service';
import { ConfigModule } from '@nestjs/config';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './services/transaction.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRATION_TIME },
    }),
  ],
  controllers: [UserController, TransactionController],
  providers: [
    UserService,
    AuthService,
    PrismaService,
    WalletService,
    TransactionService,
  ],
})
export class AppModule {}
