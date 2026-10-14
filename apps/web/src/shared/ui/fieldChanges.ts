/** Un campo con su valor de antes y el de después («Importe», «45 €», «40 €»). */
export type FieldChange = [field: string, before: string, after: string];

/** Solo los campos cuyo valor cambia. */
export function changedFields(fields: FieldChange[]): FieldChange[] {
  return fields.filter(([, before, after]) => before !== after);
}
