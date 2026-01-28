# nest-seat-lock

## 프로젝트 개요

NestJS와 Redis 분산 락(Distributed Lock)을 활용한 티켓팅 서비스의 좌석 예약 시스템입니다. 대규모 트래픽 상황에서 발생하는 동시성 문제를 Redis 기반의 분산 락으로 해결하여 데이터 정합성을 보장합니다.

## 주요 기능

### 1. 분산 락 (Distributed Lock)
- **Redis SET NX PX 명령어**를 사용한 atomic한 락 획득
- **Lua 스크립트**를 활용한 안전한 락 해제
- 락 획득 실패 시 자동 재시도 메커니즘
- 락 타임아웃 설정으로 데드락 방지

### 2. 좌석 예약 시스템
- 좌석 생성, 조회, 예약, 취소 기능
- 예약 만료 시간 설정 (기본 10분)
- 동시 예약 요청 시 선착순 처리
- 데이터 정합성 보장 (이중 예약 방지)

### 3. 동시성 제어
- 같은 좌석에 대한 동시 예약 요청 처리
- 락 기반의 트랜잭션 보호
- 재시도 로직으로 사용자 경험 개선

## 기술 스택

- **Backend Framework**: NestJS 11.x
- **Database**: PostgreSQL 15
- **Cache & Lock**: Redis 7
- **ORM**: TypeORM 0.3.x
- **Language**: TypeScript
- **Testing**: Jest

## 아키텍처

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP Request
       ▼
┌─────────────────────────────────┐
│     NestJS Application          │
│  ┌───────────────────────────┐  │
│  │   SeatController          │  │
│  └───────────┬───────────────┘  │
│              ▼                   │
│  ┌───────────────────────────┐  │
│  │   SeatService             │  │
│  │  - Business Logic         │  │
│  └───────┬───────────────────┘  │
│          │                       │
│          ├──────────┬───────────┤
│          ▼          ▼           │
│  ┌──────────┐  ┌──────────────┐│
│  │ TypeORM  │  │ RedisLock    ││
│  │ (DB)     │  │ Service      ││
│  └────┬─────┘  └──────┬───────┘│
└───────┼────────────────┼────────┘
        ▼                ▼
   PostgreSQL          Redis
```

## 설치 및 실행

### 1. 사전 요구사항

- Node.js 18.x 이상
- Docker & Docker Compose
- npm 또는 yarn

### 2. 프로젝트 클론 및 의존성 설치

```bash
git clone https://github.com/jihwankim97/nest-seat-lock.git
cd nest-seat-lock
npm install
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일 내용:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=ticketing

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Application
NODE_ENV=development
PORT=3000
```

### 4. Docker Compose로 Redis & PostgreSQL 실행

```bash
docker-compose up -d
```

서비스 확인:
```bash
docker-compose ps
```

### 5. 애플리케이션 실행

```bash
# 개발 모드
npm run start:dev

# 프로덕션 빌드
npm run build
npm run start:prod
```

서버가 `http://localhost:3000`에서 실행됩니다.

## API 엔드포인트

### 좌석 관리

#### 1. 좌석 생성
```http
POST /seats
Content-Type: application/json

{
  "seatNumber": "A1",
  "price": 50000
}
```

#### 2. 모든 좌석 조회
```http
GET /seats
```

#### 3. 특정 좌석 조회
```http
GET /seats/:seatNumber
```

### 예약 관리

#### 4. 좌석 예약 (분산 락 적용)
```http
POST /seats/reserve
Content-Type: application/json

{
  "userId": "user123",
  "seatNumber": "A1"
}
```

**동작 방식:**
1. Redis 분산 락 획득 시도 (최대 5번 재시도, 200ms 간격)
2. 좌석 상태 확인 (AVAILABLE 여부)
3. 기존 예약 중복 체크
4. 좌석 상태를 RESERVED로 변경
5. 예약 레코드 생성 (10분 만료 시간 설정)
6. 락 해제

#### 5. 예약 취소
```http
DELETE /seats/reservations/:id
```

#### 6. 사용자 예약 목록 조회
```http
GET /seats/reservations/user/:userId
```

#### 7. 만료된 예약 정리
```http
POST /seats/cleanup
```

## 분산 락 구현 상세

### RedisLockService

```typescript
// 락 획득
const lockValue = await lockService.acquireLock('seat:A1', {
  ttl: 5000,        // 5초 동안 유효
  retryCount: 5,    // 5번 재시도
  retryDelay: 200   // 200ms 간격
});

// 락으로 보호된 코드 실행
await lockService.executeWithLock('seat:A1', async () => {
  // 동시성 제어가 필요한 로직
}, { ttl: 5000 });

// 락 해제
await lockService.releaseLock('seat:A1', lockValue);
```

### 핵심 메커니즘

1. **락 획득**: Redis `SET key value PX milliseconds NX`
   - NX: key가 존재하지 않을 때만 설정
   - PX: TTL을 밀리초 단위로 설정

2. **락 해제**: Lua 스크립트로 atomic하게 처리
```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

3. **락 식별자**: `timestamp-random` 조합으로 고유성 보장
   - 다른 프로세스의 락을 실수로 해제하는 것 방지

## 테스트

### 단위 테스트 실행
```bash
npm test
```

### 커버리지 확인
```bash
npm run test:cov
```

### 테스트 구조
- **redis-lock.service.spec.ts**: 분산 락 로직 검증
  - 락 획득/해제 성공 케이스
  - 재시도 로직
  - 에러 핸들링
  
- **seat.service.spec.ts**: 좌석 예약 비즈니스 로직 검증
  - 좌석 생성/조회
  - 분산 락을 사용한 예약
  - 동시성 제어
  - 예약 취소

## 동시성 테스트 시나리오

### 시나리오 1: 동시 예약 요청

```bash
# 터미널 1
curl -X POST http://localhost:3000/seats/reserve \
  -H "Content-Type: application/json" \
  -d '{"userId": "user1", "seatNumber": "A1"}'

# 터미널 2 (거의 동시에 실행)
curl -X POST http://localhost:3000/seats/reserve \
  -H "Content-Type: application/json" \
  -d '{"userId": "user2", "seatNumber": "A1"}'
```

**예상 결과:**
- 한 명만 예약 성공 (201 Created)
- 다른 한 명은 실패 (409 Conflict - Seat is not available)

### 시나리오 2: 대량 동시 요청

```bash
# Apache Bench로 부하 테스트
ab -n 100 -c 10 -p reserve.json -T application/json \
  http://localhost:3000/seats/reserve
```

## 성능 최적화

### 1. DB 부하 감소
- Redis 락으로 DB 트랜잭션 전 필터링
- 불필요한 DB 접근 최소화

### 2. 락 성능
- 짧은 TTL (5초) 설정으로 빠른 락 회전
- 적절한 재시도 횟수와 간격

### 3. 확장성
- Redis Cluster로 수평 확장 가능
- 락 키를 좌석별로 분리하여 병렬 처리

## 모니터링

### Redis 모니터링
```bash
# Redis 연결 확인
docker exec -it nest-seat-lock-redis redis-cli ping

# 현재 락 확인
docker exec -it nest-seat-lock-redis redis-cli keys "lock:*"

# 특정 락 TTL 확인
docker exec -it nest-seat-lock-redis redis-cli ttl "lock:seat:A1"
```

### 애플리케이션 로그
```bash
# 락 획득 로그
[RedisLockService] Lock acquired for key: seat:A1

# 예약 성공 로그
[SeatService] Seat A1 successfully reserved for user user123

# 락 해제 로그
[RedisLockService] Lock released for key: seat:A1
```

## 트러블슈팅

### 1. 락 타임아웃
**증상**: 락 획득 실패
**해결**: TTL 증가 또는 재시도 횟수 증가

### 2. 데드락
**증상**: 락이 해제되지 않음
**해결**: Redis의 자동 TTL 만료로 해결 (설정된 TTL 후 자동 해제)

### 3. Redis 연결 오류
**증상**: Redis connection error
**해결**: 
```bash
docker-compose restart redis
```

## 향후 개선 사항

1. **Redlock 알고리즘 적용**
   - 다중 Redis 인스턴스로 더 강력한 분산 락

2. **이벤트 기반 아키텍처**
   - 예약 성공/실패 이벤트 발행
   - 비동기 처리로 성능 향상

3. **메트릭 수집**
   - Prometheus + Grafana 연동
   - 락 획득 시간, 예약 성공률 모니터링

4. **캐싱 전략**
   - 좌석 상태를 Redis에 캐싱
   - DB 읽기 부하 추가 감소

## 라이선스

ISC

## 작성자

jihwankim97

