import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../citas/entities/appointment.entity.js';
import { BUSINESS_TIME_ZONE } from '../citas/appointment-rules.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Vehicle, VehicleStatus } from '../vehiculos/entities/vehicle.entity.js';
import { Sale } from '../ventas/entities/sale.entity.js';
import type { SalesByMonthDto, StockByBrandDto, SummaryDto } from './dto/metrics.dto.js';
import { bogotaMonthKey, lastMonthKeys, monthEnd, monthStart } from './months.js';

interface CountAndTotal {
  count: string;
  total: string;
}

/** Métricas del panel admin. Todo se calcula en la BD; el dinero viaja como texto con 2 decimales. */
@Injectable()
export class MetricasService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  async summary(now = new Date()): Promise<SummaryDto> {
    const month = bogotaMonthKey(now);
    const [stock, pending, sold] = await Promise.all([
      this.vehicles
        .createQueryBuilder('v')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(v.price), 0)', 'total')
        .where('v.status <> :sold', { sold: VehicleStatus.SOLD })
        .getRawOne<CountAndTotal>(),
      this.appointments.countBy({ status: AppointmentStatus.PENDING }),
      this.sales
        .createQueryBuilder('s')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(s.finalPrice), 0)', 'total')
        .where('s.soldAt >= :start AND s.soldAt < :end', { start: monthStart(month), end: monthEnd(month) })
        .getRawOne<CountAndTotal>(),
    ]);
    return {
      month,
      vehiclesInStock: Number(stock?.count ?? 0),
      stockValue: toMoney(stock?.total),
      pendingAppointments: pending,
      salesThisMonth: Number(sold?.count ?? 0),
      revenueThisMonth: toMoney(sold?.total),
    };
  }

  /** Una fila por mes (del más antiguo al más reciente), con ceros en los meses sin ventas. */
  async salesByMonth(months: number, now = new Date()): Promise<SalesByMonthDto[]> {
    const keys = lastMonthKeys(now, months);
    const monthExpr = `to_char(s.soldAt AT TIME ZONE '${BUSINESS_TIME_ZONE}', 'YYYY-MM')`;
    const rows = await this.sales
      .createQueryBuilder('s')
      .select(monthExpr, 'month')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(s.finalPrice), 0)', 'total')
      .where('s.soldAt >= :start AND s.soldAt < :end', {
        start: monthStart(keys[0]),
        end: monthEnd(keys[keys.length - 1]),
      })
      .groupBy(monthExpr)
      .getRawMany<{ month: string } & CountAndTotal>();

    const byMonth = new Map(rows.map((row) => [row.month, row]));
    return keys.map((month) => ({
      month,
      count: Number(byMonth.get(month)?.count ?? 0),
      total: toMoney(byMonth.get(month)?.total),
    }));
  }

  /** Todas las marcas, incluso las que hoy no tienen inventario disponible. */
  async stockByBrand(): Promise<StockByBrandDto[]> {
    const rows = await this.brands
      .createQueryBuilder('b')
      .leftJoin(Vehicle, 'v', 'v.brandId = b.id AND v.status <> :sold', { sold: VehicleStatus.SOLD })
      .select('b.id', 'brandId')
      .addSelect('b.name', 'brand')
      .addSelect('COUNT(v.id)', 'count')
      .addSelect('COALESCE(SUM(v.price), 0)', 'value')
      .groupBy('b.id')
      .addGroupBy('b.name')
      .orderBy('COUNT(v.id)', 'DESC')
      .addOrderBy('b.name', 'ASC')
      .getRawMany<{ brandId: number; brand: string; count: string; value: string }>();
    return rows.map((row) => ({
      brandId: Number(row.brandId),
      brand: row.brand,
      count: Number(row.count),
      value: toMoney(row.value),
    }));
  }
}

/** Postgres devuelve SUM(numeric) como texto exacto; solo se completan los 2 decimales (sin pasar por float). */
function toMoney(value: string | undefined): string {
  const text = value ?? '0';
  if (!text.includes('.')) return `${text}.00`;
  const [whole, fraction] = text.split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
