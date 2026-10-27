// Controls the OSCompliance engine judges: the plugin reads their verdicts and never evaluates them.
export const ENGINE_JUDGED_CONTROLS = ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6'];

export const isEngineJudged = (controlId: string): boolean => ENGINE_JUDGED_CONTROLS.includes(controlId);
