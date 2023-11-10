import { OmitType } from '@nestjs/swagger';
import CreateOrderDto from './createOrder.dto';

class UpdateOrderDto extends OmitType(CreateOrderDto, ['orderCode']) {}

export default UpdateOrderDto;
