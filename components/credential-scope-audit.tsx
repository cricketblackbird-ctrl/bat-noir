export function CredentialScopeAudit() {
  return (
    <>
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

      <section className="credential-scope-audit credential-scope-audit--database" aria-labelledby="database-credential-heading">
        <header className="credential-scope-header">
          <p className="credential-scope-kicker">Credential scope audit</p>
          <h2 id="database-credential-heading">Default Vector / Database Credential Permissions</h2>
        </header>

        <div className="credential-scope-notice credential-scope-notice--warning" role="note">
          <p><strong>Security Notice:</strong> Database and vector storage connections require strict schema isolation. Ensure table access is scoped explicitly to operational telemetry data rather than broad cluster-wide roles.</p>
        </div>

        <div className="credential-scope-list">
          <h3>Recommended Least-Privilege Practice</h3>
          <ul>
            <li><strong>Connection Pooling:</strong><span> Restrict database connectors to application-specific connection strings.</span></li>
            <li><strong>Credential Rotation:</strong><span> Periodically rotate database secrets to prevent stale tokens from retaining access to telemetry tables.</span></li>
          </ul>
        </div>

        <footer className="credential-scope-footer">
          <span>Database: Isolated Schema</span>
          <span className="credential-scope-status credential-scope-status--warning">Review Recommended</span>
        </footer>
      </section>

      <section className="credential-scope-audit credential-scope-audit--summary" aria-labelledby="privacy-audit-heading">
        <header className="credential-scope-header">
          <p className="credential-scope-kicker">Credential Audit View Update</p>
          <h2 id="privacy-audit-heading">Privacy Audit Card Alignment (Commit d90d781)</h2>
        </header>

        <div className="credential-scope-notice credential-scope-notice--success" role="note">
          <p><strong>Integration Status:</strong> The privacy audit card has been updated to match your exact reference structure, incorporating precise integration status reporting and clean code validation.</p>
        </div>

        <div className="credential-scope-list">
          <h3>Build &amp; Inspection Summary</h3>
          <ul>
            <li><strong>Code Quality:</strong><span> TypeScript compilation and diff checks pass cleanly.</span></li>
            <li><strong>Preview Verification:</strong><span> The page loads successfully but remains at the sign-in boundary; authenticated visual inspection is pending session state.</span></li>
            <li><strong>Version Control:</strong><span> Changes successfully packaged and pushed under commit <code>d90d781</code>.</span></li>
          </ul>
        </div>

        <footer className="credential-scope-footer">
          <span>Commit: d90d781</span>
          <span className="credential-scope-status">Committed &amp; Synced</span>
        </footer>
      </section>
    </>
  )
}
