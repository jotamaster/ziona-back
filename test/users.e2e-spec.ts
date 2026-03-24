import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /users crea y retorna usuario', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ email, name: 'E2E User' })
      .expect(201);

    expect(res.body).toMatchObject({
      email,
      name: 'E2E User',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.publicCode).toBeDefined();
    expect(res.body.deletedAt).toBeUndefined();

    const byId = await request(app.getHttpServer())
      .get(`/users/${res.body.id}`)
      .expect(200);
    expect(byId.body.email).toBe(email);

    await request(app.getHttpServer())
      .get(`/users/by-public-code/${res.body.publicCode}`)
      .expect(200)
      .expect((r) => {
        expect(r.body.id).toBe(res.body.id);
      });
  });

  it('POST /users con email duplicado responde 409', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/users')
      .send({ email, name: 'Primero' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/users')
      .send({ email, name: 'Segundo' })
      .expect(409);
  });

  it('GET /users/:id inexistente responde 404', () => {
    return request(app.getHttpServer())
      .get('/users/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
