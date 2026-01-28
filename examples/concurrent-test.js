#!/usr/bin/env node
/**
 * 동시성 테스트 스크립트
 * 
 * 이 스크립트는 여러 사용자가 동시에 같은 좌석을 예약하려고 할 때
 * Redis 분산 락이 올바르게 동작하는지 테스트합니다.
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  success: '\x1b[32m',
  error: '\x1b[31m',
  info: '\x1b[36m',
  warning: '\x1b[33m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function createSeat(seatNumber, price) {
  try {
    const response = await axios.post(`${BASE_URL}/seats`, {
      seatNumber,
      price,
    });
    log(`✓ 좌석 생성 성공: ${seatNumber} (가격: ${price}원)`, colors.success);
    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      log(`⚠ 좌석이 이미 존재함: ${seatNumber}`, colors.warning);
    } else {
      log(`✗ 좌석 생성 실패: ${error.message}`, colors.error);
    }
  }
}

async function reserveSeat(userId, seatNumber) {
  const startTime = Date.now();
  try {
    const response = await axios.post(`${BASE_URL}/seats/reserve`, {
      userId,
      seatNumber,
    });
    const duration = Date.now() - startTime;
    log(
      `✓ [${userId}] 예약 성공! 좌석: ${seatNumber}, 예약 ID: ${response.data.id}, 소요시간: ${duration}ms`,
      colors.success,
    );
    return { success: true, data: response.data, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error.response?.status === 409) {
      log(
        `✗ [${userId}] 예약 실패: ${error.response.data.message}, 소요시간: ${duration}ms`,
        colors.error,
      );
    } else {
      log(`✗ [${userId}] 예약 에러: ${error.message}, 소요시간: ${duration}ms`, colors.error);
    }
    return { success: false, error: error.response?.data || error.message, duration };
  }
}

async function getSeats() {
  try {
    const response = await axios.get(`${BASE_URL}/seats`);
    return response.data;
  } catch (error) {
    log(`✗ 좌석 조회 실패: ${error.message}`, colors.error);
    return [];
  }
}

async function runConcurrencyTest(seatNumber, userCount) {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.info);
  log(`동시성 테스트 시작: ${userCount}명의 사용자가 좌석 ${seatNumber}을 동시에 예약`, colors.info);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.info);

  const startTime = Date.now();

  // 동시에 여러 예약 요청 발생
  const promises = [];
  for (let i = 1; i <= userCount; i++) {
    promises.push(reserveSeat(`user${i}`, seatNumber));
  }

  // 모든 요청이 완료될 때까지 대기
  const results = await Promise.all(promises);

  const totalTime = Date.now() - startTime;

  // 결과 분석
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.info);
  log('테스트 결과', colors.info);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.info);
  log(`총 요청 수: ${userCount}`);
  log(`성공: ${successCount}`, colors.success);
  log(`실패: ${failCount}`, colors.error);
  log(`총 소요 시간: ${totalTime}ms`);
  log(
    `평균 응답 시간: ${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)}ms`,
  );

  if (successCount === 1 && failCount === userCount - 1) {
    log('\n✓ 동시성 제어 성공! 정확히 1명만 예약되었습니다.', colors.success);
  } else {
    log(
      `\n✗ 동시성 제어 실패! ${successCount}명이 예약되었습니다. (기대값: 1명)`,
      colors.error,
    );
  }
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.info);

  return { successCount, failCount, totalTime };
}

async function main() {
  try {
    log('\n🚀 티켓팅 시스템 동시성 테스트 시작\n', colors.info);

    // 서버 연결 확인
    try {
      await axios.get(BASE_URL);
      log(`✓ 서버 연결 성공: ${BASE_URL}`, colors.success);
    } catch (error) {
      log(`✗ 서버에 연결할 수 없습니다: ${BASE_URL}`, colors.error);
      log('서버가 실행 중인지 확인하세요: npm run start:dev', colors.warning);
      process.exit(1);
    }

    // 테스트 좌석 생성
    await createSeat('A1', 50000);
    await createSeat('A2', 50000);
    await createSeat('A3', 50000);

    // 시나리오 1: 10명이 동시에 같은 좌석 예약
    await runConcurrencyTest('A1', 10);

    // 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 시나리오 2: 50명이 동시에 같은 좌석 예약 (고부하)
    await runConcurrencyTest('A2', 50);

    // 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 시나리오 3: 100명이 동시에 같은 좌석 예약 (매우 고부하)
    await runConcurrencyTest('A3', 100);

    // 최종 좌석 상태 확인
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.info);
    log('최종 좌석 상태', colors.info);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.info);
    const seats = await getSeats();
    seats.forEach((seat) => {
      log(`좌석 ${seat.seatNumber}: ${seat.status} (가격: ${seat.price}원)`);
    });
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.info);

    log('✓ 모든 테스트 완료!', colors.success);
  } catch (error) {
    log(`\n✗ 테스트 중 오류 발생: ${error.message}`, colors.error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { runConcurrencyTest, createSeat, reserveSeat };
