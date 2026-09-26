/** Labelled text input used by the builder and the exchange form. */
export function Field({ label, value, onChange, placeholder, type = "text", required = false, id, error, inputRef, onBlur, hint }: any) {
  const inputId = id || (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  const errorId = inputId && error ? `${inputId}-error` : undefined;

  return (
    <label className="field-label" htmlFor={inputId}>
      <span>{label}{required ? " *" : ""}</span>
      {hint ? <small className="field-hint" style={{ fontSize: "12px", color: "#6b6f82", display: "block", marginBottom: "4px" }}>{hint}</small> : null}
      <input
        id={inputId}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={error ? "has-error" : undefined}
      />
      {error ? (
        <span id={errorId} className="field-error-text" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
