// Reading and writing the app URL parameters, without React.

export const parseRouterSearch = (search: string): Record<string, string> => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export const withRouterSearch = (
  search: string,
  changes: Record<string, string | undefined>
): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
};
