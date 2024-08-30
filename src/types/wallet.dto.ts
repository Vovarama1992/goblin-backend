import { IsEnum, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({
    example: 1,
    description: 'The ID of the user who owns the wallet',
    type: Number, // Указываем тип данных
  })
  @IsNumber()
  userId: number;

  @ApiProperty({
    example: 'TRON',
    description: 'The blockchain on which the wallet is created',
    enum: ['TRON'], // Используем enum для перечисления возможных значений
    type: String, // Указываем тип данных
  })
  @IsEnum(['TRON'])
  blockchain: string;
}
