/** Tiny {placeholder} interpolation for dictionary templates. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? whole : String(value);
  });
}
