import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../common/pagination.js';
import type { Paginated } from '../common/pagination.js';
import { escapeLike } from '../common/sql.js';
import type { CustomerDto } from './dto/customer.dto.js';
import type { CustomerQueryDto } from './dto/customer-query.dto.js';
import { Customer } from './entities/customer.entity.js';

@Injectable()
export class ClientesService {
  constructor(@InjectRepository(Customer) private readonly customers: Repository<Customer>) {}

  async create(dto: CustomerDto): Promise<Customer> {
    await this.assertEmailFree(dto.email);
    return this.customers.save(this.customers.create(this.toFields(dto)));
  }

  async findAll(query: CustomerQueryDto): Promise<Paginated<Customer>> {
    const qb = this.customers.createQueryBuilder('c').orderBy('c.id', 'DESC');
    if (query.q) {
      qb.where("(c.name ILIKE :q ESCAPE '\\' OR c.email ILIKE :q ESCAPE '\\')", {
        q: `%${escapeLike(query.q)}%`,
      });
    }
    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Customer> {
    const customer = await this.customers.findOneBy({ id });
    if (!customer) throw new NotFoundException(`No existe el cliente ${id}`);
    return customer;
  }

  async update(id: number, dto: CustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);
    if (customer.email !== dto.email.toLowerCase()) await this.assertEmailFree(dto.email);
    Object.assign(customer, this.toFields(dto));
    return this.customers.save(customer);
  }

  /** El correo se guarda en minúsculas para que la unicidad no dependa de mayúsculas. */
  private toFields(dto: CustomerDto): Pick<Customer, 'name' | 'email' | 'phone'> {
    return { name: dto.name, email: dto.email.toLowerCase(), phone: dto.phone ?? null };
  }

  private async assertEmailFree(email: string): Promise<void> {
    if (await this.customers.existsBy({ email: email.toLowerCase() })) {
      throw new ConflictException('Ya existe un cliente con ese correo');
    }
  }
}
