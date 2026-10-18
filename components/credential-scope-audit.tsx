export function CredentialScopeAudit() {
  return (
    <section className="credential-scope-audit" aria-labelledby="credential-scope-heading">
      <header className="credential-scope-header">
        <p className="credential-scope-kicker">Credential scope audit</p>
        <h2 id="credential-scope-heading">Default object storage credential permissions</h2>
      </header>

      <div className="credential-scope-notice" role="note">
        <p><strong>Reported scope profile:</strong> The object storage credential is described as granting read, write, and deletion privileges for stored assets, telemetry artifacts, and static backups. These permissions are user-provided and have not been independently verified by the app.</p>
      </div>

      <div className="credential-scope-list">
        <h3>Authorized scope list</h3>
        <p className="credential-scope-intro">Scopes reported for the Default object storage credential.</p>
        <ul>
          <li><code>storage:read</code><span>Permits reading and querying storage objects.</span></li>
          <li><strong>List &amp; download objects:</strong><span>Authorizes traversing bucket directories and retrieving file payloads.</span></li>
          <li><code>storage:write</code><span>Permits creating and updating files in the bucket.</span></li>
          <li><strong>Upload &amp; delete objects:</strong><span>Authorizes ingesting new assets and purging obsolete data.</span></li>
        </ul>
      </div>

      <footer className="credential-scope-footer">
        <span>Storage: Default object credential</span>
        <span className="credential-scope-status">Reported · not live-verified</span>
      </footer>
    </section>
  )
}
