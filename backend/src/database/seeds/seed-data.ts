import { FuelType, Transmission, VehicleStatus } from '../../vehiculos/entities/vehicle.entity.js';

const G = FuelType.GASOLINE;
const D = FuelType.DIESEL;
const H = FuelType.HYBRID;
const E = FuelType.ELECTRIC;
const MT = Transmission.MANUAL;
const AT = Transmission.AUTOMATIC;
const N = VehicleStatus.NEW;
const U = VehicleStatus.USED;

export interface BrandSeed {
  name: string;
  country: string;
}

/** [modelo, versión, año, precio COP, km, combustible, transmisión, color, estado] */
export type VehicleRow = [string, string, number, number, number, FuelType, Transmission, string, VehicleStatus];

export const BRANDS: BrandSeed[] = [
  { name: 'Toyota', country: 'Japón' },
  { name: 'Chevrolet', country: 'Estados Unidos' },
  { name: 'Mazda', country: 'Japón' },
  { name: 'Renault', country: 'Francia' },
  { name: 'Kia', country: 'Corea del Sur' },
  { name: 'Hyundai', country: 'Corea del Sur' },
  { name: 'Ford', country: 'Estados Unidos' },
  { name: 'Nissan', country: 'Japón' },
  { name: 'Volkswagen', country: 'Alemania' },
  { name: 'BMW', country: 'Alemania' },
];

export const VEHICLES: Record<string, VehicleRow[]> = {
  Toyota: [
    ['Corolla Cross', 'XEI Hybrid', 2024, 168900000, 0, H, AT, 'Blanco', N],
    ['Hilux', 'SRV 4x4', 2024, 245000000, 0, D, AT, 'Gris', N],
    ['Yaris', 'Sport', 2023, 72000000, 18500, G, AT, 'Rojo', U],
    ['RAV4', 'XLE', 2023, 189000000, 22000, G, AT, 'Negro', U],
    ['Fortuner', 'SW4 Limited', 2024, 295000000, 0, D, AT, 'Plata', N],
    ['Land Cruiser Prado', 'TX', 2022, 285000000, 41000, G, AT, 'Blanco', U],
  ],
  Chevrolet: [
    ['Onix', 'Turbo LT', 2024, 76900000, 0, G, AT, 'Blanco', N],
    ['Tracker', 'Premier', 2024, 112900000, 0, G, AT, 'Gris', N],
    ['Captiva', 'Premier', 2023, 119000000, 15000, G, AT, 'Negro', U],
    ['Spark GT', 'LT', 2022, 42500000, 30500, G, MT, 'Rojo', U],
    ['Groove', 'Turbo', 2023, 98500000, 9800, G, AT, 'Azul', U],
    ['Equinox', 'RS', 2024, 168000000, 0, G, AT, 'Blanco', N],
  ],
  Mazda: [
    ['Mazda 2', 'Grand Touring', 2024, 89900000, 0, G, AT, 'Rojo', N],
    ['Mazda 3', 'Touring', 2024, 124900000, 0, G, AT, 'Gris', N],
    ['CX-30', 'Grand Touring', 2024, 139900000, 0, G, AT, 'Blanco', N],
    ['CX-5', 'Grand Touring LX', 2023, 158000000, 17200, G, AT, 'Negro', U],
    ['CX-50', 'Premium', 2024, 189900000, 0, G, AT, 'Azul', N],
    ['MX-5', 'Miata RF', 2021, 195000000, 12000, G, MT, 'Rojo', U],
  ],
  Renault: [
    ['Kwid', 'Zen', 2024, 51900000, 0, G, MT, 'Naranja', N],
    ['Sandero', 'Stepway Intens', 2024, 78900000, 0, G, AT, 'Gris', N],
    ['Duster', 'Iconic', 2024, 105900000, 0, G, AT, 'Blanco', N],
    ['Logan', 'Intens', 2022, 55500000, 36000, G, MT, 'Plata', U],
    ['Captur', 'Intens', 2023, 99900000, 14000, G, AT, 'Negro', U],
    ['Koleos', 'Intens', 2022, 128000000, 33500, G, AT, 'Gris', U],
  ],
  Kia: [
    ['Picanto', 'Zenith', 2024, 62900000, 0, G, AT, 'Rojo', N],
    ['Rio', 'Zenith', 2024, 85900000, 0, G, AT, 'Blanco', N],
    ['Seltos', 'Pro', 2024, 118900000, 0, G, AT, 'Gris', N],
    ['Sportage', 'GT-Line', 2024, 164900000, 0, G, AT, 'Negro', N],
    ['Sorento', 'Hybrid', 2023, 229000000, 12500, H, AT, 'Azul', U],
    ['EV6', 'GT-Line', 2024, 299900000, 0, E, AT, 'Verde', N],
  ],
  Hyundai: [
    ['Grand i10', 'GL', 2024, 58900000, 0, G, MT, 'Blanco', N],
    ['Accent', 'GL Plus', 2023, 72500000, 11800, G, AT, 'Gris', U],
    ['Tucson', 'Limited', 2024, 159900000, 0, G, AT, 'Negro', N],
    ['Creta', 'Grand Premium', 2024, 119900000, 0, G, AT, 'Rojo', N],
    ['Santa Fe', 'Calligraphy', 2023, 219000000, 20800, D, AT, 'Gris', U],
    ['Ioniq 5', 'Limited', 2024, 289900000, 0, E, AT, 'Blanco', N],
  ],
  Ford: [
    ['Fiesta', 'Titanium', 2020, 48500000, 52000, G, AT, 'Azul', U],
    ['Escape', 'Titanium', 2023, 149000000, 16500, G, AT, 'Blanco', U],
    ['Explorer', 'Limited', 2024, 259000000, 0, G, AT, 'Negro', N],
    ['Ranger', 'XLT 4x4', 2024, 219900000, 0, D, AT, 'Gris', N],
    ['Territory', 'Titanium', 2024, 139900000, 0, G, AT, 'Plata', N],
    ['Bronco Sport', 'Badlands', 2023, 199000000, 9500, G, AT, 'Verde', U],
  ],
  Nissan: [
    ['March', 'Advance', 2022, 49900000, 28000, G, MT, 'Rojo', U],
    ['Versa', 'Exclusive', 2024, 86900000, 0, G, AT, 'Gris', N],
    ['Kicks', 'Exclusive', 2024, 109900000, 0, G, AT, 'Naranja', N],
    ['Qashqai', 'Exclusive', 2023, 135000000, 13400, G, AT, 'Blanco', U],
    ['X-Trail', 'e-Power', 2024, 192900000, 0, H, AT, 'Negro', N],
    ['Frontier', 'LE 4x4', 2024, 206000000, 0, D, AT, 'Plata', N],
  ],
  Volkswagen: [
    ['Polo', 'Highline', 2024, 87900000, 0, G, AT, 'Blanco', N],
    ['Virtus', 'Highline', 2024, 99900000, 0, G, AT, 'Gris', N],
    ['T-Cross', 'Highline', 2024, 124900000, 0, G, AT, 'Azul', N],
    ['Taos', 'Comfortline', 2023, 149900000, 19000, G, AT, 'Negro', U],
    ['Tiguan', 'R-Line', 2024, 215900000, 0, G, AT, 'Gris', N],
    ['Amarok', 'Highline V6', 2023, 268000000, 24500, D, AT, 'Blanco', U],
  ],
  BMW: [
    ['Serie 1', '118i', 2023, 189000000, 14500, G, AT, 'Blanco', U],
    ['Serie 3', '320i M Sport', 2024, 275000000, 0, G, AT, 'Negro', N],
    ['X1', 'sDrive20i', 2024, 259000000, 0, G, AT, 'Gris', N],
    ['X3', 'xDrive30e', 2023, 349000000, 11000, H, AT, 'Azul', U],
    ['X5', 'xDrive40i', 2024, 599000000, 0, G, AT, 'Negro', N],
    ['iX3', 'Inspiring', 2024, 389000000, 0, E, AT, 'Blanco', N],
  ],
};
