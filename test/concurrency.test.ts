/**
 * 동시성 테스트
 *
 * 100명이 동시에 같은 좌석을 예약하려고 할 때
 * 단 1명만 성공하는지 검증
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LockService } from '../src/common/interfaces/lock-service.interface';

describe('Concurrency Test (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lockService: LockService;

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

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    lockService = moduleFixture.get<LockService>(LockService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow only one user to lock a seat when 100 users try simultaneously', async () => {
    // 테스트 데이터 준비
    const performance = await prisma.performance.create({
      data: {
        title: 'Test Performance',
        date: new Date(),
        venue: 'Test Venue',
        totalSeats: 100,
      },
    });

    const seat = await prisma.seat.create({
      data: {
        performanceId: performance.id,
        seatNumber: 'A-1',
        status: 'AVAILABLE',
      },
    });

    // 100명의 사용자가 동시에 좌석 예약 시도
    const concurrentRequests = 100;
    const promises = Array.from({ length: concurrentRequests }, (_, i) => {
      return request(app.getHttpServer())
        .post(`/api/performances/${performance.id}/seats/${seat.id}/lock`)
        .set('X-User-Id', `user-${i}`)
        .send({ userId: `user-${i}` });
    });

    const results = await Promise.allSettled(promises);

    // 성공한 요청 수 계산
    const successful = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200,
    ).length;

    // 실패한 요청 수 계산 (409 Conflict - 이미 락됨)
    const failed = results.filter(
      (r) =>
        r.status === 'fulfilled' &&
        (r.value.status === 409 || r.value.status === 400),
    ).length;

    // 단 1명만 성공해야 함
    expect(successful).toBe(1);
    expect(failed).toBe(concurrentRequests - 1);

    // DB에서 좌석 상태 확인
    const updatedSeat = await prisma.seat.findUnique({
      where: { id: seat.id },
    });

    expect(updatedSeat?.status).toBe('LOCKED');

    // 정리
    await prisma.seatLock.deleteMany({ where: { seatId: seat.id } });
    await prisma.seat.delete({ where: { id: seat.id } });
    await prisma.performance.delete({ where: { id: performance.id } });
  }, 30000); // 30초 타임아웃
});
