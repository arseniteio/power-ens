/** Parameter input form. */

import assert from 'node:assert/strict';
import Module from 'node:module';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';

const hooks: any[] = [];
let hookIndex = 0;
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    type,
    props: {
      ...props,
      ...(children.length
        ? { children: children.length === 1 ? children[0] : children }
        : {}),
    },
  }),
  Fragment: 'Fragment',
  useState: (initial: any) => {
    const index = hookIndex++;
    if (!(index in hooks)) hooks[index] = initial;
    return [
      hooks[index],
      (next: any) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next;
      },
    ];
  },
};
const originalLoad = (Module as any)._load;
let ListParameterRenderer: any;
let PatternParameterRenderer: any;
try {
  (Module as any)._load = function (name: string, ...args: any[]) {
    if (name === 'react') return { ...react, default: react, __esModule: true };
    if (name === '@elastic/eui')
      return Object.fromEntries(
        [
          'EuiFormRow',
          'EuiSelect',
          'EuiComboBox',
          'EuiFieldText',
          'EuiText',
          'EuiSpacer',
        ].map((key) => [key, key])
      );
    return originalLoad.call(this, name, ...args);
  };
  ({
    ListParameterRenderer,
  } = require('../public/ens/configuration/form-engine/renderers/list-parameter-renderer'));
  ({
    PatternParameterRenderer,
  } = require('../public/ens/configuration/form-engine/renderers/pattern-parameter-renderer'));
} finally {
  (Module as any)._load = originalLoad;
}

const nodes = (node: any): any[] =>
  !node
    ? []
    : Array.isArray(node)
    ? node.flatMap(nodes)
    : typeof node === 'object'
    ? [node, ...nodes(node.props?.children)]
    : [];
const find = (node: any, type: string) =>
  nodes(node).find((n) => n.type === type)!;
const original = opAcc1Configuration.parameters.find((p) => p.id === 'P-04')!;
let parameter = { ...original };
let value: any = ['guest'];
const onChange = (_name: string, next: any) => {
  value = next;
};
const renderList = () => {
  hookIndex = 0;
  return ListParameterRenderer({ parameter, value, onChange });
};
let tree = renderList();
let prevented = false;
find(tree, 'div').props.onPasteCapture({
  target: { value: '', selectionStart: 0, selectionEnd: 0 },
  clipboardData: { getData: () => 'admin,test administrador,admin' },
  preventDefault: () => {
    prevented = true;
  },
  stopPropagation: () => {},
});
assert(prevented);
assert.deepEqual(value, ['guest', 'admin', 'test', 'administrador']);
assert.equal(find(tree, 'EuiFormRow').props.isInvalid, false);

tree = renderList();
find(tree, 'EuiComboBox').props.onSearchChange('operador admin2 ');
assert.deepEqual(value, [
  'guest',
  'admin',
  'test',
  'administrador',
  'operador',
  'admin2',
]);
tree = renderList();
find(tree, 'EuiComboBox').props.onCreateOption('temp,demo');
assert.deepEqual(value.slice(-2), ['temp', 'demo']);
tree = renderList();
find(tree, 'EuiComboBox').props.onSearchChange('invitado');
tree = renderList();
find(tree, 'EuiComboBox').props.onBlur();
assert.equal(
  value[value.length - 1],
  'invitado',
  'the last name is confirmed on blur'
);

parameter = { ...original, id: 'P-01', name: 'fuente_identidad' };
value = [];
tree = renderList();
find(tree, 'EuiComboBox').props.onCreateOption('Active Directory,Azure AD');
assert.deepEqual(value, ['Active Directory', 'Azure AD']);

hooks.length = 0;
parameter = { ...original };
value = ['admin.*', 'guest'];
const renderPattern = () => {
  hookIndex = 0;
  return PatternParameterRenderer({
    parameter,
    value,
    onChange,
    onMatchModeChange: (_name: string, mode: 'exact' | 'regex') => {
      parameter = { ...parameter, matchMode: mode };
    },
  });
};
tree = renderPattern();
find(tree, 'EuiSelect').props.onChange({ target: { value: 'regex' } });
assert.equal(parameter.matchMode, 'regex');
assert.equal(
  value,
  '(?i)^(?:admin\\.\\*|guest)$',
  'switching escapes metacharacters and, on a forbidden list, ignores case like «Texto exacto»'
);
tree = renderPattern();
let fields = nodes(tree).filter((n) => n.type === 'EuiFieldText');
fields[0].props.onChange({ target: { value: '^svc_.*$' } });
fields[1].props.onChange({ target: { value: 'svc_backup' } });
tree = renderPattern();
assert(
  nodes(tree).some(
    (n) => n.type === 'p' && n.props.children === 'Coincide con la expresión.'
  )
);
fields = nodes(tree).filter((n) => n.type === 'EuiFieldText');
fields[0].props.onChange({ target: { value: '[' } });
tree = renderPattern();
assert(
  nodes(tree).some(
    (n) =>
      n.type === 'EuiFormRow' &&
      n.props.isInvalid &&
      /regular/.test(n.props.error)
  )
);
find(tree, 'EuiSelect').props.onChange({ target: { value: 'exact' } });
assert.deepEqual(
  value,
  ['admin.*', 'guest'],
  'going back restores the literal draft'
);
tree = renderPattern();
find(tree, 'EuiSelect').props.onChange({ target: { value: 'regex' } });
assert.equal(
  value,
  '[',
  'and keeps the regex draft as written'
);
console.log(
  'ALL OK: paste, multiple typing, names with spaces, mode selector and pattern test.'
);
