export function CredentialScopeAudit() {
  return (
    <section className="credential-scope-audit" aria-labelledby="credential-scope-heading">
      <header className="credential-scope-header">
        <p className="credential-scope-kicker">Credential scope audit</p>
        <h2 id="credential-scope-heading">Default object storage credential permissions</h2>
      </header>

      <div className="credential-scope-notice" role="note">
        <strong>Reported scopes.</strong> The app cannot inspect provider-side credential grants; this panel reflects the scope details provided for the default object storage credential.
      </div>

      <div className="credential-scope-list">
        <h3>Scopes granted</h3>
        <p className="credential-scope-intro">Scopes granted to the Default object storage credential.</p>
        <ul>
          <li><code>storage:read</code><span>List &amp; download objects</span></li>
          <li><code>storage:write</code><span>Upload &amp; delete objects</span></li>
        </ul>
      </div>

      <footer className="credential-scope-footer">
        <span>Object storage: Default credential</span>
        <span className="credential-scope-status">Reported · not live-verified</span>
      </footer>
    </section>
  )
}
