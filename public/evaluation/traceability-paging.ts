// Where a page of the traceability table comes from: the entries the evaluation already brought, or the server. No React. A page is requested only beyond what the response holds, and never beyond what the server keeps (`available`).
export const traceabilityPageSource = (options: {
  initialCount: number;
  available: number;
  pageFrom: number;
  pageSize: number;
}): 'local' | 'remote' => {
  const hasta = Math.min(options.pageFrom + options.pageSize, options.available);
  return hasta > options.initialCount ? 'remote' : 'local';
};
