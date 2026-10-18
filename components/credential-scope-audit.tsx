export function CredentialScopeAudit() {
  return (
    <section className="credential-scope-audit" aria-labelledby="credential-scope-heading">
      <header className="credential-scope-header">
        <p className="credential-scope-kicker">Credential scope audit</p>
        <h2 id="credential-scope-heading">Default AI Gateway credential permissions</h2>
      </header>

      <div className="credential-scope-notice" role="note">
        <strong>Reported scope.</strong> The app cannot inspect provider-side credential grants; this panel reflects the scope details provided for the default gateway credential.
      </div>

      <div className="credential-scope-list">
        <h3>Scopes granted</h3>
        <p className="credential-scope-intro">Scopes granted to the Default AI gateway credential.</p>
        <ul>
          <li><code>ai_gateway: invoke</code></li>
          <li><strong>Call AI models</strong></li>
        </ul>
      </div>

      <footer className="credential-scope-footer">
        <span>Gateway: Default AI credential</span>
        <span className="credential-scope-status">Reported · not live-verified</span>
      </footer>
    </section>
  )
}
