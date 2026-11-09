import { Shirt, Wand2, type LucideIcon } from 'lucide-react';
import type { ItemKind } from '../data/types';

/** Wording and routes for the two inventory kinds that share one table. */
export const itemLabels: Record<ItemKind, { one: string; many: string; One: string; Many: string; base: string; Icon: LucideIcon; parts: string; part: string; partExample: string }> = {
  costume: { one: 'costume', many: 'costumes', One: 'Costume', Many: 'Costumes', base: '/costumes', Icon: Shirt, parts: 'Accessories', part: 'accessory', partExample: 'e.g. Headpiece' },
  prop: { one: 'prop', many: 'props', One: 'Prop', Many: 'Props', base: '/props', Icon: Wand2, parts: 'Parts / pieces', part: 'part', partExample: 'e.g. Batteries' },
};
