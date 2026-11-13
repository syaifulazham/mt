/**
 * Options of the "Negeri" filter: the rows of the "Pecahan mengikut Negeri"
 * table (states, the no-state row, then the Antarabangsa countries), so the
 * filter lists exactly what the table shows. Falls back to the plain state
 * list until the breakdown has loaded.
 */
export function StateFilterOptions({ rows, states }: {
  rows?: { stateName: string; filterKey?: string; isInternational?: boolean }[] | null;
  states: { id: string; name: string }[];
}) {
  const keyed = (rows ?? []).filter(r => r.filterKey);
  if (!keyed.length) return <>{states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</>;
  const local = keyed.filter(r => !r.isInternational), intl = keyed.filter(r => r.isInternational);
  return (
    <>
      {local.map(r => <option key={r.filterKey} value={r.filterKey}>{r.stateName === "–" ? "Tiada negeri" : r.stateName}</option>)}
      {intl.length > 0 && (
        <optgroup label="Antarabangsa">
          {intl.map(r => <option key={r.filterKey} value={r.filterKey}>{r.stateName}</option>)}
        </optgroup>
      )}
    </>
  );
}
