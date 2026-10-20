import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../citas/entities/appointment.entity.js';
import { Customer } from '../clientes/entities/customer.entity.js';
import { paginate } from '../common/pagination.js';
import type { Paginated, PaginationDto } from '../common/pagination.js';
import { Vehicle, VehicleStatus } from '../vehiculos/entities/vehicle.entity.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';
import { Sale } from './entities/sale.entity.js';
import { assertFinalPrice } from './sale-rules.js';

const SALE_RELATIONS = { vehicle: { brand: true }, customer: true, seller: true } as const;

@Injectable()
export class VentasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
  ) {}

  /**
   * Registra la venta y marca el vehículo como vendido en UNA transacción. El vehículo se
   * bloquea con FOR UPDATE: si dos vendedores intentan venderlo a la vez, el segundo espera,
   * ve el estado `vendido` y recibe 409. El índice único de ventas.vehiculo_id es el respaldo.
   */
  async create(dto: CreateSaleDto, sellerId: number): Promise<Sale> {
    // Antes de abrir la transacción: un precio inválido no debe bloquear el vehículo ni tocar la BD.
    assertFinalPrice(dto.finalPrice);
    // La venta se devuelve leída dentro de la misma transacción: si esa lectura fallara después del commit,
    // el cliente vería un error aunque la venta ya quedó registrada (y reintentar daría 409).
    return this.dataSource.transaction(async (manager) => {
      await this.lockAvailableVehicle(manager, dto.vehicleId);
      await this.assertCustomerExists(manager, dto.customerId);

      const sale = await manager.save(
        manager.create(Sale, {
          vehicleId: dto.vehicleId,
          customerId: dto.customerId,
          sellerId,
          finalPrice: dto.finalPrice,
          payment: dto.payment,
        }),
      );
      // La revisión sube para que una edición abierta antes de la venta ya no pueda guardarse.
      await manager.update(Vehicle, dto.vehicleId, { status: VehicleStatus.SOLD, revision: () => 'revision + 1' });
      await this.cancelOpenAppointments(manager, dto.vehicleId);
      return manager.findOneOrFail(Sale, { where: { id: sale.id }, relations: SALE_RELATIONS });
    });
  }

  async findAll(query: PaginationDto): Promise<Paginated<Sale>> {
    const [data, total] = await this.sales.findAndCount({
      relations: SALE_RELATIONS,
      order: { soldAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Sale> {
    const sale = await this.sales.findOne({ where: { id }, relations: SALE_RELATIONS });
    if (!sale) throw new NotFoundException(`No existe la venta ${id}`);
    return sale;
  }

  private async lockAvailableVehicle(manager: EntityManager, vehicleId: number): Promise<void> {
    const vehicle = await manager.findOne(Vehicle, {
      where: { id: vehicleId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!vehicle) throw new NotFoundException(`No existe el vehículo ${vehicleId}`);
    if (vehicle.status === VehicleStatus.SOLD) {
      throw new ConflictException('Ese vehículo ya fue vendido');
    }
  }

  private async assertCustomerExists(manager: EntityManager, customerId: number): Promise<void> {
    if (!(await manager.existsBy(Customer, { id: customerId }))) {
      throw new NotFoundException(`No existe el cliente ${customerId}`);
    }
  }

  /** Un auto vendido no puede tener test-drives pendientes: se cancelan en la misma transacción. */
  private async cancelOpenAppointments(manager: EntityManager, vehicleId: number): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Appointment)
      .set({ status: AppointmentStatus.CANCELLED })
      .where('vehicleId = :vehicleId AND status <> :cancelled', {
        vehicleId,
        cancelled: AppointmentStatus.CANCELLED,
      })
      .execute();
  }
}
