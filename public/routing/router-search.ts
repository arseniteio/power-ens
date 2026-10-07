// Lectura y escritura de los parámetros de la URL de la app, sin React: lo
// prueban las pruebas sin dashboard y lo usan los hooks de `use-router-search`.

export const parseRouterSearch = (search: string): Record<string, string> => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const resultado: Record<string, string> = {};
  params.forEach((valor, clave) => {
    resultado[clave] = valor;
  });
  return resultado;
};

export const withRouterSearch = (
  search: string,
  cambios: Record<string, string | undefined>
): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined || valor === '') params.delete(clave);
    else params.set(clave, valor);
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
};
