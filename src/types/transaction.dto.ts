import { ApiProperty } from '@nestjs/swagger';
import { TransactionType, TransactionStatus } from '@prisma/client';

export class CreateInternalTransactionDto {
  @ApiProperty({ example: 1, description: 'The ID of the sender wallet' })
  fromWalletId: number;

  @ApiProperty({ example: 2, description: 'The ID of the recipient wallet' })
  toWalletId: number;

  @ApiProperty({ example: 50, description: 'The amount to transfer' })
  amount: number;

  @ApiProperty({
    example: 'USDT',
    description: 'The currency of the transaction',
  })
  currency: string;
}

export class CreateExternalTransactionDto {
  @ApiProperty({ example: 1, description: 'The ID of the sender wallet' })
  fromWalletId: number;

  @ApiProperty({
    example: 'TXjG6n1h2B4MxY5U6V8RrZsJ4yNkQc5yRf',
    description: 'The external address of the recipient',
  })
  externalAddress: string;

  @ApiProperty({ example: 50, description: 'The amount to transfer' })
  amount: number;

  @ApiProperty({
    example: 'USDT',
    description: 'The currency of the transaction',
  })
  currency: string;
}

export class TransactionDto {
  @ApiProperty({ example: 1, description: 'The unique ID of the transaction' })
  id: number;

  @ApiProperty({
    example: 'INTERNAL',
    description: 'The type of the transaction',
  })
  type: TransactionType;

  @ApiProperty({
    example: 'USDT',
    description: 'The currency of the transaction',
  })
  currency: string;

  @ApiProperty({ example: 50, description: 'The amount of the transaction' })
  amount: number;

  @ApiProperty({
    example: 'COMPLETED',
    description: 'The status of the transaction',
  })
  status: TransactionStatus;

  @ApiProperty({
    example: '2024-08-25T14:15:22Z',
    description: 'The date and time when the transaction was created',
  })
  createdAt: Date;
}
