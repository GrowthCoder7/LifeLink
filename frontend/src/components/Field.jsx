// Labelled form control with an inline error tied to it for screen readers.
export function Field({ id, label, error, hint, children }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && <small id={`${id}-hint`} className="field-hint">{hint}</small>}
      {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
    </div>
  );
}

export function Select({ options, format = (v) => v, ...props }) {
  return (
    <select {...props}>
      {options.map((option) => (
        <option key={option} value={option}>{format(option)}</option>
      ))}
    </select>
  );
}
