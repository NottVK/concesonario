import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';

export const MAX_BODY_DEPTH = 20;
export const MAX_BODY_NODES = 20_000;

/**
 * Rechaza cuerpos JSON absurdamente anidados o enormes antes de que lleguen a `class-transformer`, que
 * recorre el objeto de forma recursiva: con miles de niveles se desbordaba la pila y respondía 500.
 * El recorrido es iterativo, así que él mismo no puede desbordarse.
 */
@Injectable()
export class BodyShapePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body' || typeof value !== 'object' || value === null) return value;

    const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];
    let nodes = 0;
    while (stack.length > 0) {
      const { node, depth } = stack.pop() as { node: unknown; depth: number };
      if (typeof node !== 'object' || node === null) continue;
      if (depth > MAX_BODY_DEPTH || ++nodes > MAX_BODY_NODES) {
        throw new BadRequestException('El cuerpo de la petición es demasiado complejo');
      }
      for (const child of Object.values(node)) stack.push({ node: child, depth: depth + 1 });
    }
    return value;
  }
}
