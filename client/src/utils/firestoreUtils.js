export const sanitizeFirestoreData = (data) => {
  if (data === undefined) return undefined;
  if (data === null) return null;

  if (Array.isArray(data)) {
    const cleanedArray = data
      .map(sanitizeFirestoreData)
      .filter((item) => item !== undefined);
    return cleanedArray;
  }

  if (typeof data === 'object') {
    const cleanedObject = {};
    Object.entries(data).forEach(([key, value]) => {
      const cleanedValue = sanitizeFirestoreData(value);
      if (cleanedValue !== undefined) {
        cleanedObject[key] = cleanedValue;
      }
    });
    return cleanedObject;
  }

  return data;
};
