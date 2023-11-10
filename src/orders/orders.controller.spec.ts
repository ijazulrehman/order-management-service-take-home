import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OrdersController from './orders.controller';
import OrdersService from './orders.service';
import CreateOrderDto from './dto/createOrder.dto';
import UpdateOrderDto from './dto/updateOrder.dto';
import Order from './entities/order.entity';
import { PaginatedOrdersResultDto } from './dto/paginatedOrdersResult.dto';
import Product from '../products/product.entity';
import OrderProducts from './entities/order-products.entity';
import { OrderStatus, OrderType } from './order.enum';

export type MockType<T> = {
  [P in keyof T]: jest.Mock<unknown>;
};

export const repositoryMockFactory: jest.Mock<
  { findOne: jest.Mock<any, [undefined]> },
  any[]
> = jest.fn(() => ({
  findOne: jest.fn((entity) => entity),
}));

describe('OrdersController', () => {
  let ordersController: OrdersController;
  let ordersService: OrdersService;
  let repositoryMock: MockType<Repository<Order>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useFactory: repositoryMockFactory,
        },
        {
          provide: getRepositoryToken(Product),
          useFactory: repositoryMockFactory,
        },
        {
          provide: getRepositoryToken(OrderProducts),
          useFactory: repositoryMockFactory,
        },
      ],
    }).compile();

    repositoryMock = moduleRef.get(getRepositoryToken(Order));
    ordersService = moduleRef.get<OrdersService>(OrdersService);
    ordersController = moduleRef.get<OrdersController>(OrdersController);
  });

  describe('getAllOrders', () => {
    it('should return an array of orders', async () => {
      const result = new PaginatedOrdersResultDto();
      jest
        .spyOn(ordersService, 'getAllOrders')
        .mockImplementation(() => Promise.resolve(result));

      expect(
        await ordersController.getAllOrders(
          {
            limit: 10,
            page: 1,
          },
          {},
        ),
      ).toBe(result);
    });
  });

  describe('getOrderById', () => {
    it('should return a single order', async () => {
      const result: Order = new Order();
      jest
        .spyOn(ordersService, 'getOrderById')
        .mockImplementation(() => Promise.resolve(result));

      expect(await ordersController.getOrderById('1')).toBe(result);
    });
  });

  describe('createOrder', () => {
    it('should create a new order', async () => {
      const createOrderDto: CreateOrderDto = new CreateOrderDto();
      const result = {
        orderProducts: [],
        totalPrice: 10,
        orderCode: '',
        orderType: OrderType.Custom,
        products: [],
        orderStatus: OrderStatus.Pending,
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest
        .spyOn(ordersService, 'createOrder')
        .mockImplementation(() => Promise.resolve(result));
      expect(await ordersController.createOrder(createOrderDto)).toBe(result);
    });
  });

  describe('replaceOrder', () => {
    it('should update an existing order', async () => {
      const updateOrderDto: UpdateOrderDto = new UpdateOrderDto();
      const result = {
        updatedOrderProducts: [],
        totalPrice: 10,
        orderCode: '',
        orderType: OrderType.Custom,
        products: [],
        orderStatus: OrderStatus.Pending,
        id: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest
        .spyOn(ordersService, 'updateOrder')
        .mockImplementation(() => Promise.resolve(result));

      expect(await ordersController.replaceOrder('1', updateOrderDto)).toBe(
        result,
      );
    });
  });

  describe('deleteOrder', () => {
    it('should delete an existing order', async () => {
      const result: void = undefined;
      jest
        .spyOn(ordersService, 'deleteOrder')
        .mockImplementation(() => Promise.resolve(result));

      expect(await ordersController.deleteOrder('1')).toBe(result);
    });
  });
});
