import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '../entities/sale.entity.js';
import type { Sale } from '../entities/sale.entity.js';

/**
 * Vistas del historial de ventas. Se arman campo por campo (lista blanca) para que nunca se filtre un dato
 * de más: la lista lleva solo el nombre del cliente; el correo solo va en el detalle; el teléfono, nunca.
 */
export class SaleVehicleDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Mazda' })
  brand: string;

  @ApiProperty({ example: 'Mazda 3' })
  model: string;

  @ApiProperty({ example: 2024 })
  year: number;

  @ApiProperty({ example: 'Touring' })
  version: string;
}

export class SaleVehicleDetailDto extends SaleVehicleDto {
  @ApiProperty({ example: 'Rojo' })
  color: string;

  @ApiProperty({ example: 0, description: 'Kilometraje' })
  mileage: number;

  @ApiProperty({ example: '120000000.00', description: 'Precio de lista del vehículo, en COP' })
  listPrice: string;
}

export class SalePersonDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'Ana Pérez' })
  name: string;
}

export class SaleCustomerDetailDto extends SalePersonDto {
  @ApiProperty({ example: 'ana@correo.co', description: 'Solo en el detalle de la venta' })
  email: string;
}

export class SaleListItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: String, format: 'date-time' })
  soldAt: Date;

  @ApiProperty({ example: '115000000.50', description: 'Precio final en COP, texto con 2 decimales' })
  finalPrice: string;

  @ApiProperty({ enum: PaymentMethod })
  payment: PaymentMethod;

  @ApiProperty({ type: () => SaleVehicleDto })
  vehicle: SaleVehicleDto;

  @ApiProperty({ type: () => SalePersonDto, description: 'Solo id y nombre' })
  customer: SalePersonDto;

  @ApiProperty({ type: () => SalePersonDto, description: 'Quien registró la venta: solo id y nombre' })
  seller: SalePersonDto;
}

export class SaleDetailDto extends SaleListItemDto {
  @ApiProperty({ type: () => SaleVehicleDetailDto })
  declare vehicle: SaleVehicleDetailDto;

  @ApiProperty({ type: () => SaleCustomerDetailDto, description: 'Nombre y correo; el teléfono nunca se devuelve' })
  declare customer: SaleCustomerDetailDto;
}

const person = (entity: { id: number; name: string }): SalePersonDto => ({ id: entity.id, name: entity.name });

/** Requiere las relaciones `vehicle.brand`, `customer` y `seller` cargadas. */
export function toSaleListItem(sale: Sale): SaleListItemDto {
  return {
    id: sale.id,
    soldAt: sale.soldAt,
    finalPrice: sale.finalPrice,
    payment: sale.payment,
    vehicle: {
      id: sale.vehicle.id,
      brand: sale.vehicle.brand.name,
      model: sale.vehicle.model,
      year: sale.vehicle.year,
      version: sale.vehicle.version,
    },
    customer: person(sale.customer),
    seller: person(sale.seller),
  };
}

export function toSaleDetail(sale: Sale): SaleDetailDto {
  return {
    id: sale.id,
    soldAt: sale.soldAt,
    finalPrice: sale.finalPrice,
    payment: sale.payment,
    vehicle: {
      id: sale.vehicle.id,
      brand: sale.vehicle.brand.name,
      model: sale.vehicle.model,
      year: sale.vehicle.year,
      version: sale.vehicle.version,
      color: sale.vehicle.color,
      mileage: sale.vehicle.mileage,
      listPrice: sale.vehicle.price,
    },
    customer: { id: sale.customer.id, name: sale.customer.name, email: sale.customer.email },
    seller: person(sale.seller),
  };
}
