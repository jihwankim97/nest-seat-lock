/**
 * 분산 락 서비스 추상 인터페이스
 * 
 * 다양한 락 구현체(Redis, DB 등)를 추상화하여
 * 결합도를 낮추고 테스트 가능성을 높입니다.
 */
export abstract class LockService {
  /**
   * 락 획득 시도
   * @param key 락 키
   * @param value 락 값 (소유자 식별용)
   * @param ttl 락 유지 시간 (초)
   * @returns 락 획득 성공 여부
   */
  abstract acquire(key: string, value: string, ttl: number): Promise<boolean>;

  /**
   * 락 해제
   * @param key 락 키
   * @param value 락 값 (소유자 확인용)
   * @returns 해제 성공 여부
   */
  abstract release(key: string, value: string): Promise<boolean>;

  /**
   * 락 소유자 확인
   * @param key 락 키
   * @returns 락 소유자 값 또는 null
   */
  abstract getOwner(key: string): Promise<string | null>;

  /**
   * 락 존재 여부 확인
   * @param key 락 키
   * @returns 락 존재 여부
   */
  abstract exists(key: string): Promise<boolean>;

  /**
   * 락 TTL 연장
   * @param key 락 키
   * @param ttl 새로운 TTL (초)
   * @returns 연장 성공 여부
   */
  abstract extend(key: string, ttl: number): Promise<boolean>;
}

