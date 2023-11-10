import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import Order from './entities/order.entity';
import CreateOrderDto from './dto/createOrder.dto';
import UpdateOrderDto from './dto/updateOrder.dto';
import { PaginationDto } from './dto/pagination.dto';
import { PaginatedOrdersResultDto } from './dto/paginatedOrdersResult.dto';
import { FilteringDto } from './dto/filtering.dto';
import Product from '../products/product.entity';
import OrderProducts from './entities/order-products.entity';
import {
  checkForProductQuantityAvailability,
  getOrderIdsAndQuantity,
} from './orders.util';

@Injectable()
export default class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(OrderProducts)
    private orderProductsRepository: Repository<OrderProducts>,
  ) {}

  private static getFilterQuery(
    filteringDto: FilteringDto,
    ordersQueryBuilder: SelectQueryBuilder<Order>,
  ): SelectQueryBuilder<Order> {
    let ordersFilterQuery = ordersQueryBuilder;

    if (filteringDto.id) {
      ordersFilterQuery = ordersQueryBuilder.where('orders.id = :id', {
        id: filteringDto.id,
      });
    }

    if (filteringDto.orderCode) {
      ordersFilterQuery = ordersFilterQuery.andWhere(
        'orders.orderCode = :orderCode',
        {
          orderCode: filteringDto.orderCode,
        },
      );
    }

    if (filteringDto.orderType) {
      ordersFilterQuery = ordersFilterQuery.andWhere(
        'orders.orderType = :orderType',
        {
          orderType: filteringDto.orderType,
        },
      );
    }

    if (filteringDto.orderStatus) {
      ordersFilterQuery = ordersFilterQuery.andWhere(
        'orders.orderStatus = :orderStatus',
        {
          orderStatus: filteringDto.orderStatus,
        },
      );
    }

    return ordersFilterQuery;
  }

  async getAllOrders(
    paginationDto: PaginationDto,
    filteringDto: FilteringDto,
  ): Promise<PaginatedOrdersResultDto> {
    const skippedItems = (paginationDto.page - 1) * paginationDto.limit;

    const totalCount = await this.ordersRepository.count();
    const ordersQueryBuilder =
      this.ordersRepository.createQueryBuilder('orders');

    const ordersFilterQuery = OrdersService.getFilterQuery(
      filteringDto,
      ordersQueryBuilder,
    );

    const orders = await ordersFilterQuery
      .orderBy('id', 'DESC')
      .offset(skippedItems)
      .limit(paginationDto.limit)
      .getMany();

    return {
      totalCount,
      page: paginationDto.page,
      limit: paginationDto.limit,
      data: orders,
    };
  }

  async getOrderById(id: number) {
    const order = await this.ordersRepository.findOne({
      where: { id },
    });
    if (order) {
      return order;
    }
    throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
  }

  /**
   * TODO: Use transaction to perform
   * TODO: simplify the function
   *
   * @param order
   * @returns
   */
  async createOrder(order: CreateOrderDto) {
    const { orderedProductIds, productQuantityKeyPair } =
      getOrderIdsAndQuantity(order.products);

    const foundProducts = await this.productsRepository.find({
      where: {
        id: In(orderedProductIds),
      },
    });

    await checkForProductQuantityAvailability(
      foundProducts,
      orderedProductIds,
      productQuantityKeyPair,
    );

    let totalPrice = 0;

    const queryRunner =
      this.productsRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const product of foundProducts) {
        this.productsRepository.merge(product, {
          quantity: product.quantity - productQuantityKeyPair[product.id],
        });
        await queryRunner.manager.save(Product, product);

        totalPrice =
          totalPrice + productQuantityKeyPair[product.id] * product.price;
      }

      const newOrder: Order = await queryRunner.manager.save(Order, {
        ...order,
        totalPrice,
      });

      const newOrderProducts = order.products.map((product) =>
        queryRunner.manager.create(OrderProducts, {
          order: { id: newOrder.id },
          product: { id: product.productId },
          quantity: product.quantity,
        }),
      );

      const savedOrderProducts = await queryRunner.manager.save(
        OrderProducts,
        newOrderProducts,
      );
      await queryRunner.commitTransaction();

      return {
        ...newOrder,
        orderProducts: savedOrderProducts,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * TODO: add support for product quantity
   * It is updating the quantity in OrderProducts and Products table
   * Right now, adding new product to order is not supported
   * @param id
   * @param order
   */
  async updateOrder(id: number, order: UpdateOrderDto) {
    const foundOrder = await this.ordersRepository.findOne({
      where: {
        id,
      },
      relations: ['orderProducts', 'orderProducts.product'],
    });

    if (!foundOrder) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    // For current implementation, we are not allowing to add more products in order
    // Filtering out any product which do not exists already in order
    order.products =
      order.products?.filter((product) =>
        foundOrder.orderProducts.some(
          (op) => op.product.id === product.productId,
        ),
      ) ?? [];

    const { orderedProductIds, productQuantityKeyPair } =
      getOrderIdsAndQuantity(order.products);

    // Product.quantity will be NewQuantity - OldQuantity
    // In case it is negative, it means add back to Product.quantity
    // Previously user ordered 5 units of product, now he want 3
    // so we will add 2 back to product quantity
    order.products.forEach((product) => {
      const previousOrderItem = foundOrder.orderProducts.find(
        (orderItem) => orderItem.product.id === product.productId,
      );
      if (previousOrderItem) {
        productQuantityKeyPair[product.productId] -= previousOrderItem.quantity;
      }
    });

    const foundProducts = await this.productsRepository.find({
      where: {
        id: In(orderedProductIds),
      },
    });

    await checkForProductQuantityAvailability(
      foundProducts,
      orderedProductIds,
      productQuantityKeyPair,
    );

    let totalPrice = 0;

    const queryRunner =
      this.productsRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const product of foundProducts) {
        await queryRunner.manager.save(Product, {
          ...(product as Product),
          quantity: product.quantity - productQuantityKeyPair[product.id],
        });
        totalPrice += productQuantityKeyPair[product.id] * product.price;
      }

      const newOrderProducts = order.products.map((product) => {
        const previousOrderItem = foundOrder.orderProducts.find(
          (orderItem) => orderItem.product.id === product.productId,
        );

        return queryRunner.manager.save(OrderProducts, {
          id: previousOrderItem?.id,
          quantity: product.quantity,
        });
      });

      const savedOrderProducts = await Promise.all(newOrderProducts);

      const updatedOrder = { ...order, totalPrice };
      delete updatedOrder.products;
      await queryRunner.manager.update(Order, id, updatedOrder);

      await queryRunner.commitTransaction();

      return {
        ...updatedOrder,
        updatedOrderProducts: savedOrderProducts,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteOrder(id: number) {
    const deleteResponse = await this.ordersRepository.delete(id);
    if (!deleteResponse.affected) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }
  }

  /**
   *
   *
   * @param reportDate
   */
  async queryDailyReport(reportDate: string) {
    const start = `${reportDate} 00:00:00`;
    const end = `${reportDate} 23:59:59`;

    // Get revenue (1) and number of orders (2)
    const ordersReport = await this.ordersRepository
      .createQueryBuilder('orders')
      .select('SUM(orders.totalPrice)', 'revenue')
      .addSelect('COUNT(orders.orderCode)', 'numberOfOrders')
      .where(`orders.updatedAt BETWEEN '${start}' AND '${end}'`)
      .getRawOne();

    return {
      ...ordersReport,
    };
  }
}
