import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { Public, Roles } from '../common/decorators.js';
import { UserRole } from '../usuarios/entities/user.entity.js';
import { BrandDto } from './dto/brand.dto.js';
import { Brand } from './entities/brand.entity.js';
import { MarcasService } from './marcas.service.js';

@ApiTags('marcas')
@Controller('marcas')
export class MarcasController {
  constructor(private readonly brands: MarcasService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lista de marcas, ordenada por nombre' })
  @ApiOkResponse({ type: [Brand] })
  findAll(): Promise<Brand[]> {
    return this.brands.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una marca' })
  @ApiOkResponse({ type: Brand })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseIdPipe) id: number): Promise<Brand> {
    return this.brands.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Crear marca (admin)' })
  @ApiCreatedResponse({ type: Brand })
  @ApiConflictResponse({ description: 'Ya existe una marca con ese nombre' })
  create(@Body() dto: BrandDto): Promise<Brand> {
    return this.brands.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar una marca (admin)' })
  @ApiOkResponse({ type: Brand })
  update(@Param('id', ParseIdPipe) id: number, @Body() dto: BrandDto): Promise<Brand> {
    return this.brands.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borrar marca (admin)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'La marca tiene vehículos' })
  remove(@Param('id', ParseIdPipe) id: number): Promise<void> {
    return this.brands.remove(id);
  }
}
