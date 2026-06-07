function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getActionFormDataValue(
  formData: FormData,
  name: string,
): FormDataEntryValue | null {
  const directValue = formData.get(name);
  if (directValue !== null) {
    return directValue;
  }

  const prefixedNamePattern = new RegExp(`^_\\d+_${escapeRegExp(name)}$`);
  for (const [key, value] of formData.entries()) {
    if (prefixedNamePattern.test(key)) {
      return value;
    }
  }

  return null;
}

export function getActionFormDataValues(
  formData: FormData,
  name: string,
): FormDataEntryValue[] {
  const directValues = formData.getAll(name);
  if (directValues.length > 0) {
    return directValues;
  }

  const prefixedNamePattern = new RegExp(`^_\\d+_${escapeRegExp(name)}$`);
  return Array.from(formData.entries())
    .filter(([key]) => prefixedNamePattern.test(key))
    .map(([, value]) => value);
}

export function getActionFormDataString(formData: FormData, name: string): string {
  const value = getActionFormDataValue(formData, name);
  return value === null ? "" : String(value);
}
