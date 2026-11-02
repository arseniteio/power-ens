export const traceabilityPageSource = (options: {
  initialCount: number;
  available: number;
  pageFrom: number;
  pageSize: number;
}): 'local' | 'remote' => {
  const until = Math.min(options.pageFrom + options.pageSize, options.available);
  return until > options.initialCount ? 'remote' : 'local';
};
