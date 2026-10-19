/** When the engine has not seen all facts, it must say so. */
declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail?: unknown
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  console.log(`  FAIL ${name}${detail !== undefined ? ` — ${String(detail)}` : ''}`);
  failures.push(name);
};

const section = (title: string): void => console.log(`\n${title}`);

const trimmed = (
  total: unknown,
  fetched: number
): number => {
  const totalInIndex =
    typeof total === 'number'
      ? total
      : typeof (total as { value?: number })?.value === 'number'
      ? (total as { value: number }).value
      : fetched;

  return Math.max(0, totalInIndex - fetched);
};

section('1. 17,444 facts and only 1,000 fetched: it is stated');

{
  check(
    'with 17,444 in the index and 1,000 fetched, 16,444 are missing',
    trimmed({ value: 17444 }, 1000) === 16444,
    trimmed({ value: 17444 }, 1000)
  );

  check(
    'and therefore the notice is shown',
    trimmed({ value: 17444 }, 1000) > 0
  );
}

section('2. When the engine has seen everything, nothing is warned about');

{
  check(
    'all fetched, nothing missing',
    trimmed({ value: 340 }, 340) === 0,
    trimmed({ value: 340 }, 340)
  );

  check(
    'without any fact, no truncation is warned about either',
    trimmed({ value: 0 }, 0) === 0
  );

  check(
    'and it does not matter whether `total` comes as a number or as an object',
    trimmed(17444, 1000) === trimmed({ value: 17444 }, 1000),
    `${trimmed(17444, 1000)} vs ${trimmed({ value: 17444 }, 1000)}`
  );

  check(
    'without `total`, no truncation is invented',
    trimmed(undefined, 500) === 0,
    trimmed(undefined, 500)
  );

  check(
    'an incoherent total does not produce a negative truncation',
    trimmed({ value: 10 }, 500) === 0,
    trimmed({ value: 10 }, 500)
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
