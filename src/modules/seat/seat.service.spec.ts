import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeatService } from './seat.service';
import { Seat, SeatStatus } from '../../entities/seat.entity';
import { Reservation, ReservationStatus } from '../../entities/reservation.entity';
import { RedisLockService } from '../redis/redis-lock.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SeatService', () => {
  let service: SeatService;
  let seatRepository: Repository<Seat>;
  let reservationRepository: Repository<Reservation>;
  let lockService: RedisLockService;

  const mockSeatRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockReservationRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockLockService = {
    executeWithLock: jest.fn(),
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatService,
        {
          provide: getRepositoryToken(Seat),
          useValue: mockSeatRepository,
        },
        {
          provide: getRepositoryToken(Reservation),
          useValue: mockReservationRepository,
        },
        {
          provide: RedisLockService,
          useValue: mockLockService,
        },
      ],
    }).compile();

    service = module.get<SeatService>(SeatService);
    seatRepository = module.get<Repository<Seat>>(getRepositoryToken(Seat));
    reservationRepository = module.get<Repository<Reservation>>(
      getRepositoryToken(Reservation),
    );
    lockService = module.get<RedisLockService>(RedisLockService);

    jest.clearAllMocks();
  });

  describe('createSeat', () => {
    it('should create a new seat', async () => {
      const createSeatDto = { seatNumber: 'A1', price: 50000 };
      const seat = { id: 1, ...createSeatDto, status: SeatStatus.AVAILABLE };

      mockSeatRepository.findOne.mockResolvedValue(null);
      mockSeatRepository.create.mockReturnValue(seat);
      mockSeatRepository.save.mockResolvedValue(seat);

      const result = await service.createSeat(createSeatDto);

      expect(result).toEqual(seat);
      expect(mockSeatRepository.create).toHaveBeenCalled();
      expect(mockSeatRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if seat already exists', async () => {
      const createSeatDto = { seatNumber: 'A1', price: 50000 };
      const existingSeat = { id: 1, ...createSeatDto, status: SeatStatus.AVAILABLE };

      mockSeatRepository.findOne.mockResolvedValue(existingSeat);

      await expect(service.createSeat(createSeatDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllSeats', () => {
    it('should return all seats', async () => {
      const seats = [
        { id: 1, seatNumber: 'A1', status: SeatStatus.AVAILABLE, price: 50000 },
        { id: 2, seatNumber: 'A2', status: SeatStatus.RESERVED, price: 50000 },
      ];

      mockSeatRepository.find.mockResolvedValue(seats);

      const result = await service.findAllSeats();

      expect(result).toEqual(seats);
      expect(mockSeatRepository.find).toHaveBeenCalledWith({
        order: { seatNumber: 'ASC' },
      });
    });
  });

  describe('findSeatByNumber', () => {
    it('should return a seat by number', async () => {
      const seat = { id: 1, seatNumber: 'A1', status: SeatStatus.AVAILABLE, price: 50000 };

      mockSeatRepository.findOne.mockResolvedValue(seat);

      const result = await service.findSeatByNumber('A1');

      expect(result).toEqual(seat);
    });

    it('should throw NotFoundException if seat not found', async () => {
      mockSeatRepository.findOne.mockResolvedValue(null);

      await expect(service.findSeatByNumber('A1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reserveSeat', () => {
    it('should reserve a seat successfully with distributed lock', async () => {
      const reserveSeatDto = { userId: 'user1', seatNumber: 'A1' };
      const seat = { id: 1, seatNumber: 'A1', status: SeatStatus.AVAILABLE, price: 50000 };
      const reservation = {
        id: 1,
        userId: 'user1',
        seatId: 1,
        status: ReservationStatus.CONFIRMED,
        expiresAt: expect.any(Date),
      };

      // Mock executeWithLock to immediately execute the callback
      mockLockService.executeWithLock.mockImplementation(async (key, callback) => {
        return await callback();
      });

      mockSeatRepository.findOne.mockResolvedValueOnce(seat).mockResolvedValueOnce(seat);
      mockReservationRepository.findOne.mockResolvedValue(null);
      mockReservationRepository.create.mockReturnValue(reservation);
      mockReservationRepository.save.mockResolvedValue(reservation);
      mockSeatRepository.save.mockResolvedValue({ ...seat, status: SeatStatus.RESERVED });

      const result = await service.reserveSeat(reserveSeatDto);

      expect(result).toEqual(reservation);
      expect(mockLockService.executeWithLock).toHaveBeenCalledWith(
        'seat:A1',
        expect.any(Function),
        expect.objectContaining({
          ttl: 5000,
          retryCount: 5,
          retryDelay: 200,
        }),
      );
    });

    it('should throw NotFoundException if seat not found', async () => {
      const reserveSeatDto = { userId: 'user1', seatNumber: 'A1' };

      mockLockService.executeWithLock.mockImplementation(async (key, callback) => {
        return await callback();
      });

      mockSeatRepository.findOne.mockReset();
      mockSeatRepository.findOne.mockResolvedValue(null);

      await expect(service.reserveSeat(reserveSeatDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if seat is not available', async () => {
      const reserveSeatDto = { userId: 'user1', seatNumber: 'A1' };
      const seat = { id: 1, seatNumber: 'A1', status: SeatStatus.RESERVED, price: 50000 };

      mockLockService.executeWithLock.mockImplementation(async (key, callback) => {
        return await callback();
      });

      mockSeatRepository.findOne.mockResolvedValue(seat);

      await expect(service.reserveSeat(reserveSeatDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if seat already has active reservation', async () => {
      const reserveSeatDto = { userId: 'user1', seatNumber: 'A1' };
      const seat = { id: 1, seatNumber: 'A1', status: SeatStatus.AVAILABLE, price: 50000 };
      const existingReservation = {
        id: 1,
        userId: 'user2',
        seatId: 1,
        status: ReservationStatus.CONFIRMED,
      };

      mockLockService.executeWithLock.mockImplementation(async (key, callback) => {
        return await callback();
      });

      mockSeatRepository.findOne.mockResolvedValue(seat);
      mockReservationRepository.findOne.mockResolvedValue(existingReservation);

      await expect(service.reserveSeat(reserveSeatDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelReservation', () => {
    it('should cancel a reservation', async () => {
      const reservationId = 1;
      const seat = { id: 1, seatNumber: 'A1', status: SeatStatus.RESERVED, price: 50000 };
      const reservation = {
        id: 1,
        userId: 'user1',
        seatId: 1,
        status: ReservationStatus.CONFIRMED,
        seat,
      };

      mockLockService.executeWithLock.mockImplementation(async (key, callback) => {
        return await callback();
      });

      mockReservationRepository.findOne.mockResolvedValue(reservation);
      mockReservationRepository.save.mockResolvedValue({
        ...reservation,
        status: ReservationStatus.CANCELLED,
      });
      mockSeatRepository.save.mockResolvedValue({ ...seat, status: SeatStatus.AVAILABLE });

      await service.cancelReservation(reservationId);

      expect(mockLockService.executeWithLock).toHaveBeenCalled();
      expect(mockReservationRepository.save).toHaveBeenCalled();
      expect(mockSeatRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if reservation not found', async () => {
      mockReservationRepository.findOne.mockResolvedValue(null);

      await expect(service.cancelReservation(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserReservations', () => {
    it('should return user reservations', async () => {
      const userId = 'user1';
      const reservations = [
        {
          id: 1,
          userId,
          seatId: 1,
          status: ReservationStatus.CONFIRMED,
          seat: { id: 1, seatNumber: 'A1' },
        },
      ];

      mockReservationRepository.find.mockResolvedValue(reservations);

      const result = await service.getUserReservations(userId);

      expect(result).toEqual(reservations);
      expect(mockReservationRepository.find).toHaveBeenCalledWith({
        where: { userId },
        relations: ['seat'],
        order: { createdAt: 'DESC' },
      });
    });
  });
});
