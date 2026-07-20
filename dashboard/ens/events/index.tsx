import { tDataGridColumn } from '../../../common/data-grid';
import { commonColumns } from '../../common/data-grid-columns';

export const EventsENS: tDataGridColumn[] = [
  commonColumns.timestamp,
  commonColumns['agent.name'],
  {
    id: 'data.ensfacil',
    initialWidth: 120,
  },
  {
    id: 'data.event',
    initialWidth: 130,
  },
  {
    id: 'data.control',
    initialWidth: 140,
  },
  {
    id: 'data.requisito',
    initialWidth: 150,
  },
  {
    id: 'data.evidence_id',
    initialWidth: 110,
  },
  {
    id: 'data.evidencias',
    initialWidth: 150,
  },
  {
    id: 'data.estado',
    initialWidth: 110,
  },
  {
    id: 'data.nivel',
    initialWidth: 90,
  },
  commonColumns['rule.description'],
  commonColumns['rule.level'],
  commonColumns['rule.id'],
];
