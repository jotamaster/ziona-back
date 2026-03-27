import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import { generatePublicCode } from 'src/common/utils/public-code.util';
import { PrismaService } from 'src/modules/prisma/prisma.service';

import { AuthExchangeDto } from './dto/auth-exchange.dto';

type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  imageUrl: string | null;
  publicCode: string;
  googleSub: string | null;
};

type ExchangeAuthResponse = {
  accessToken: string;
  user: AuthUserDto;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async exchangeIdentity(dto: AuthExchangeDto): Promise<ExchangeAuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const imageUrl = dto.imageUrl?.trim() || null;
    const googleSub = dto.googleSub.trim();

    const userRepo = this.prisma.user as any;
    const existingByGoogleSub = await userRepo.findFirst({
      where: { googleSub, deletedAt: null },
    });
    const existingByEmail = existingByGoogleSub
      ? null
      : await userRepo.findFirst({ where: { email, deletedAt: null } });
    const existing = existingByGoogleSub ?? existingByEmail;

    const user = existing
      ? await userRepo.update({
          where: { id: existing.id },
          data: { name, imageUrl, googleSub },
        })
      : await this.createUserWithPublicCode({ email, name, imageUrl, googleSub });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: this.toAuthUserDto(user),
    };
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await (this.prisma.user as any).findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.toAuthUserDto(user);
  }

  private async createUserWithPublicCode(input: {
    email: string;
    name: string;
    imageUrl: string | null;
    googleSub: string;
  }) {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const publicCode = generatePublicCode();
      try {
        return await (this.prisma.user as any).create({
          data: {
            email: input.email,
            name: input.name,
            imageUrl: input.imageUrl,
            googleSub: input.googleSub,
            publicCode,
          },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
          const fields = this.uniqueConstraintFields(e);
          if (fields.includes('publicCode')) {
            continue;
          }
          if (fields.includes('email') || fields.includes('googleSub')) {
            return this.upsertExistingUserByIdentity(input);
          }
        }
        throw e;
      }
    }

    throw new ConflictException(
      'No se pudo generar un codigo publico unico; reintenta.',
    );
  }

  private async upsertExistingUserByIdentity(input: {
    email: string;
    name: string;
    imageUrl: string | null;
    googleSub: string;
  }) {
    const existing = await (this.prisma.user as any).findFirst({
      where: {
        OR: [{ email: input.email }, { googleSub: input.googleSub }],
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new ConflictException('No se pudo resolver el usuario');
    }

    return (this.prisma.user as any).update({
      where: { id: existing.id },
      data: {
        name: input.name,
        imageUrl: input.imageUrl,
        googleSub: input.googleSub,
      },
    });
  }

  private toAuthUserDto(user: {
    id: string;
    email: string;
    name: string;
    imageUrl: string | null;
    publicCode: string;
    googleSub: string | null;
  }): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      publicCode: user.publicCode,
      googleSub: user.googleSub,
    };
  }

  /** Prisma 7 + driver adapter usa `constraint.fields`; versiones anteriores usaban `meta.target`. */
  private uniqueConstraintFields(
    error: PrismaClientKnownRequestError,
  ): string[] {
    const meta = error.meta;
    const legacy = meta?.target;
    if (Array.isArray(legacy) && legacy.every((x) => typeof x === 'string')) {
      return legacy;
    }
    const adapter = meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: string[] } } }
      | undefined;
    const fields = adapter?.cause?.constraint?.fields;
    return Array.isArray(fields) ? fields : [];
  }
}
