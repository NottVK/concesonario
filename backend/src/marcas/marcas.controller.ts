import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Public, Roles } from '../common/decorators.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { BrandDto } from './dto/brand.dto.js';
import { Brand } from './entities/brand.entity.js';
import { MarcasService } from './marcas.service.js';

@Controller('marcas')
export class MarcasController {
  constructor(private readonly brands: MarcasService) {}

  @Public()
  @Get()
  findAll(): Promise<Brand[]> {
    return this.brands.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Brand> {
    return this.brands.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: BrandDto): Promise<Brand> {
    return this.brands.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: BrandDto): Promise<Brand> {
    return this.brands.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.brands.remove(id);
  }
}
