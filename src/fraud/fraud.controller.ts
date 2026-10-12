import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import type { FraudResponseDto } from './dto/fraud-response.dto';
import { TransactionRequestDto } from './dto/transaction-request.dto';
import { FraudService } from './fraud.service';

@Controller()
export class FraudController {
  // Constructor injection, not property injection: the dependency is explicit
  // and the controller can be instantiated directly in a test.
  constructor(private readonly fraudService: FraudService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(@Body() request: TransactionRequestDto): Promise<FraudResponseDto> {
    return this.fraudService.check(request);
  }
}
