import { UnprocessableEntityException } from '@nestjs/common';
import Product from 'src/products/product.entity';
import { ProductInOrderDto } from './dto/createOrder.dto';

/**
 * It calculates if product has enough quantity available in stock
 * @param foundProducts
 * @param orderedProductIds
 * @param productQuantityKeyPair
 */
export const checkForProductQuantityAvailability = async (
  foundProducts: Product[],
  orderedProductIds: number[],
  productQuantityKeyPair: Record<string, number>,
) => {
  const productAvailablityError: {
    id: number;
    availableQuantity?: number;
    message: string;
  }[] = [];

  const foundProductsIds = foundProducts.map((product) => product.id);

  orderedProductIds.forEach((productId) => {
    if (!foundProductsIds.includes(productId))
      productAvailablityError.push({
        id: productId,
        message: 'Product not found!',
      });
  });

  foundProducts.forEach((product) => {
    const { quantity: availableQuantity, id } = product;
    if (availableQuantity < productQuantityKeyPair[id]) {
      productAvailablityError.push({
        id,
        availableQuantity,
        message: 'Insufficient Product Availability',
      });
    }
  });

  if (productAvailablityError.length > 0)
    throw new UnprocessableEntityException(productAvailablityError);
};

/**
 * It returns orderIds and productQuantity pair based on order.products
 * @param products
 * @returns
 */
export const getOrderIdsAndQuantity = (
  products: ProductInOrderDto[],
): {
  orderedProductIds: number[];
  productQuantityKeyPair: Record<string, number>;
} => {
  const orderedProductIds = products.map((product) => product.productId);

  const productQuantityKeyPair: Record<string, number> = products.reduce(
    (acc, item) => {
      const { productId, quantity } = item;
      if (acc[productId]) {
        acc[productId] += quantity;
      } else {
        acc[productId] = quantity;
      }
      return acc;
    },
    {},
  );

  return { orderedProductIds, productQuantityKeyPair };
};
