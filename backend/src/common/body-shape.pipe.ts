import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';

export const MAX_BODY_DEPTH = 20;
export const MAX_BODY_NODES = 20_000;

const NUL = String.fromCharCode(0);
const NUL_MESSAGE = 'El texto no puede contener caracteres nulos';

/**
 * Rechaza cuerpos JSON absurdamente anidados o enormes antes de que lleguen a `class-transformer`, que
 * recorre el objeto de forma recursiva: con miles de niveles se desbordaba la pila y respondía 500.
 * También rechaza el carácter nulo (U+0000) en cuerpo y consulta: PostgreSQL no lo admite en texto y
 * lo convertía en un 500. El recorrido es iterativo, así que él mismo no puede desbordarse.
 */
@Injectable()
export class BodyShapePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body' && metadata.type !== 'query') return value;
    const limitShape = metadata.type === 'body';

    const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];
    let nodes = 0;
    while (stack.length > 0) {
      const { node, depth } = stack.pop() as { node: unknown; depth: number };
      if (typeof node === 'string') {
        if (node.includes(NUL)) throw new BadRequestException(NUL_MESSAGE);
        continue;
      }
      if (typeof node !== 'object' || node === null) continue;
      if (limitShape && (depth > MAX_BODY_DEPTH || ++nodes > MAX_BODY_NODES)) {
        throw new BadRequestException('El cuerpo de la petición es demasiado complejo');
      }
      for (const [key, child] of Object.entries(node)) {
        if (key.includes(NUL)) throw new BadRequestException(NUL_MESSAGE);
        stack.push({ node: child, depth: depth + 1 });
      }
    }
    return value;
  }
}
