import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { WalletService } from './wallet.service';
import { UserDto } from 'src/types/user.dto';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async register(userDto: UserDto): Promise<User> {
    // Указываем тип возвращаемого значения
    const { email, password, name } = userDto;

    // Проверка на существование пользователя с таким же email
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаем пользователя
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    return user;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    // Указываем тип возвращаемого значения
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async findById(id: number): Promise<User | null> {
    // Указываем тип возвращаемого значения
    return this.prisma.user.findUnique({
      where: { id },
      include: { wallets: true }, // Включаем привязанные кошельки
    });
  }
}
