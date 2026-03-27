import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthExchangeDto } from './dto/auth-exchange.dto';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('exchange')
  exchange(@Body() dto: AuthExchangeDto) {
    return this.authService.exchangeIdentity(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }
}
