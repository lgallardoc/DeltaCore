export function AccessDenied() {
  return (
    <section>
      <h1>Access denied</h1>
      <p>Missing RBAC canRead for this module.</p>
    </section>
  );
}
